import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

import { INIT_ENDPOINT, UPDATE_ENDPOINT } from './endpoints.ts';
import { ensureRootObject, getNestedProperty, parsePath, setNestedProperty } from './utils.ts';

export interface DynamicTextPluginOptions {
  /**
   * Path to the copy JSON file, absolute or relative to the Vite root.
   * @default 'src/data/copy.json'
   */
  filePath?: string;
  /**
   * Top-level key (dot-notated for deeper nesting) that copy keys resolve from. With
   * `root: 'text'`, `<DynamicText path="hero.title">` reads `text.hero.title` from the file.
   * By default keys resolve from the top of the file.
   */
  root?: string;
}

export const VIRTUAL_MODULE_ID = 'virtual:dynamic-text/copy';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

/** Request bodies above this are refused with `413`. */
export const MAX_BODY_BYTES = 64 * 1024;

const PACKAGE_NAME = 'vite-plugin-dynamic-text';

interface CopyFile {
  json: Record<string, unknown>;
  indent: string | number;
  trailingNewline: boolean;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function parseCopyFile(content: string, filePath: string): CopyFile {
  if (content.trim() === '') return { json: {}, indent: 2, trailingNewline: true };
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (err) {
    throw new Error(`${filePath} is not valid JSON: ${(err as Error).message}`, { cause: err });
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  const indentMatch = /\n([ \t]+)\S/.exec(content);
  return {
    json: json as Record<string, unknown>,
    indent: indentMatch ? indentMatch[1] : 2,
    trailingNewline: content.endsWith('\n'),
  };
}

async function readCopyFile(filePath: string): Promise<CopyFile> {
  try {
    return parseCopyFile(await fs.promises.readFile(filePath, 'utf-8'), filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { json: {}, indent: 2, trailingNewline: true };
    }
    throw err;
  }
}

function serializeCopyFile({ json, indent, trailingNewline }: CopyFile): string {
  return JSON.stringify(json, null, indent) + (trailingNewline ? '\n' : '');
}

/** Same-origin check: blocks other sites you have open from POSTing to your dev server. */
function isCrossOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk: Buffer | string) => {
      if (done) return;
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, `Request body exceeds ${limit} bytes`));
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    req.on('error', (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

export function vitePluginDynamicText(options: DynamicTextPluginOptions = {}): Plugin {
  const root = options.root || undefined;
  if (root !== undefined && !parsePath(root)) {
    throw new Error(`[${PACKAGE_NAME}] Invalid "root" option: "${options.root}"`);
  }

  let resolvedFilePath = '';
  // The serialised file as this plugin last wrote it, so the watcher can tell our own writes
  // (already applied optimistically in the browser) from edits made in an editor.
  let lastWrittenContent: string | undefined;
  // Read-modify-write cycles run one at a time, so concurrent POSTs can't lose an update.
  let writeQueue: Promise<unknown> = Promise.resolve();

  function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = writeQueue.then(task, task);
    writeQueue = run.catch(() => {});
    return run;
  }

  async function handleRequest(
    endpoint: typeof UPDATE_ENDPOINT | typeof INIT_ENDPOINT,
    req: IncomingMessage,
  ): Promise<Record<string, unknown>> {
    if (isCrossOrigin(req)) throw new HttpError(403, 'Cross-origin requests are not allowed');
    if (!req.headers['content-type']?.includes('application/json')) {
      throw new HttpError(415, 'Content-Type must be application/json');
    }

    const rawBody = await readBody(req, MAX_BODY_BYTES);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, 'Request body is not valid JSON');
    }
    if (body === null || typeof body !== 'object') throw new HttpError(400, 'Request body must be an object');

    const keyPath = body.path;
    if (typeof keyPath !== 'string' || !parsePath(keyPath)) {
      throw new HttpError(400, 'Missing or invalid "path" field');
    }
    const valueField = endpoint === INIT_ENDPOINT ? 'defaultValue' : 'value';
    const value = body[valueField];
    if (typeof value !== 'string') throw new HttpError(400, `"${valueField}" must be a string`);

    return enqueueWrite(async () => {
      const file = await readCopyFile(resolvedFilePath);
      let target: Record<string, unknown>;
      try {
        target = ensureRootObject(file.json, root);
      } catch (err) {
        throw new HttpError(409, (err as Error).message);
      }

      if (endpoint === INIT_ENDPOINT) {
        const existing = getNestedProperty(target, keyPath);
        if (existing !== undefined && existing !== null && existing !== '') {
          return { ok: true, initialized: false, value: existing };
        }
      }

      try {
        setNestedProperty(target, keyPath, value);
      } catch (err) {
        throw new HttpError(409, (err as Error).message);
      }

      const content = serializeCopyFile(file);
      await fs.promises.mkdir(path.dirname(resolvedFilePath), { recursive: true });
      lastWrittenContent = content;
      await fs.promises.writeFile(resolvedFilePath, content, 'utf-8');
      return endpoint === INIT_ENDPOINT ? { ok: true, initialized: true, path: keyPath } : { ok: true, path: keyPath };
    });
  }

  return {
    name: PACKAGE_NAME,

    config() {
      return {
        // The client entry imports the virtual module, which esbuild's dependency pre-bundler
        // can't resolve, and which a Node-side external import couldn't either.
        optimizeDeps: { exclude: [PACKAGE_NAME, `${PACKAGE_NAME}/react`] },
        ssr: { noExternal: [PACKAGE_NAME] },
      };
    },

    configResolved(config) {
      resolvedFilePath = path.resolve(config.root, options.filePath ?? 'src/data/copy.json');
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
      return undefined;
    },

    async load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) return undefined;
      this.addWatchFile(resolvedFilePath);
      let json: Record<string, unknown>;
      try {
        json = (await readCopyFile(resolvedFilePath)).json;
      } catch (err) {
        this.error((err as Error).message);
      }
      if (!fs.existsSync(resolvedFilePath)) {
        this.warn(`Copy file not found at ${resolvedFilePath}; using an empty object.`);
      }
      return [
        `export const copy = ${JSON.stringify(json)};`,
        `export const root = ${JSON.stringify(root ?? null)};`,
        'export default copy;',
      ].join('\n');
    },

    handleHotUpdate({ file, server }) {
      if (path.resolve(file) !== resolvedFilePath) return undefined;
      const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
      if (mod) server.moduleGraph.invalidateModule(mod);

      let content: string | undefined;
      try {
        content = fs.readFileSync(resolvedFilePath, 'utf-8');
      } catch {
        // Deleted or mid-write: reload so the page reflects whatever's there now.
      }
      // Our own write: the browser already shows the new text, so don't reload under the editor.
      if (content !== undefined && content === lastWrittenContent) return [];
      server.ws.send({ type: 'full-reload' });
      return [];
    },

    configureServer(server: ViteDevServer) {
      server.watcher.add(resolvedFilePath);
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (req.method !== 'POST' || (url !== UPDATE_ENDPOINT && url !== INIT_ENDPOINT)) {
          next();
          return;
        }

        handleRequest(url, req).then(
          (payload) => sendJson(res, 200, payload),
          (err: unknown) => {
            if (err instanceof HttpError) {
              if (err.status === 413) res.setHeader('Connection', 'close');
              sendJson(res, err.status, { error: err.message });
              if (err.status === 413) req.resume();
              return;
            }
            server.config.logger.error(`[${PACKAGE_NAME}] ${(err as Error).message}`);
            sendJson(res, 500, { error: (err as Error).message || 'Internal server error' });
          },
        );
      });
    },
  };
}
