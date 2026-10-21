import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, createServer, type ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAX_BODY_BYTES, vitePluginDynamicText, type DynamicTextPluginOptions } from '../src/plugin';

const repoRoot = path.resolve(__dirname, '..');

let tmpDir: string;
let copyFile: string;

async function writeCopy(data: unknown, indent: string | number = 2, trailingNewline = true) {
  await fs.promises.writeFile(copyFile, JSON.stringify(data, null, indent) + (trailingNewline ? '\n' : ''));
}

async function readCopy(): Promise<any> {
  return JSON.parse(await fs.promises.readFile(copyFile, 'utf-8'));
}

beforeEach(async () => {
  // Inside the repo so the build tests can resolve react from node_modules.
  const tmpBase = path.join(repoRoot, 'node_modules/.tmp');
  await fs.promises.mkdir(tmpBase, { recursive: true });
  tmpDir = await fs.promises.mkdtemp(path.join(tmpBase, 'dynamic-text-test-'));
  copyFile = path.join(tmpDir, 'copy.json');
  await writeCopy({ text: { hero: { title: 'Original Title' } } });
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

describe('dev server endpoints', () => {
  let server: ViteDevServer;
  let baseUrl: string;

  async function start(options: DynamicTextPluginOptions = { filePath: copyFile, root: 'text' }) {
    server = await createServer({
      root: tmpDir,
      configFile: false,
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1', ws: false },
      plugins: [vitePluginDynamicText(options)],
    });
    await server.listen();
    baseUrl = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
  }

  afterEach(async () => {
    await server?.close();
  });

  function post(endpoint: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('updates the file on POST /__dynamic_text/update', async () => {
    await start();
    const res = await post('/__dynamic_text/update', { path: 'hero.title', value: 'Updated Title' });
    expect(res.status).toBe(200);
    expect((await readCopy()).text.hero.title).toBe('Updated Title');
  });

  it('initialises missing keys on POST /__dynamic_text/init', async () => {
    await start();
    const res = await post('/__dynamic_text/init', { path: 'hero.subtitle', defaultValue: 'Subtitle' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ initialized: true });
    expect((await readCopy()).text.hero.subtitle).toBe('Subtitle');
  });

  it('does not overwrite an existing key on init', async () => {
    await start();
    const res = await post('/__dynamic_text/init', { path: 'hero.title', defaultValue: 'Nope' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ initialized: false, value: 'Original Title' });
    expect((await readCopy()).text.hero.title).toBe('Original Title');
  });

  it('writes from the top of the file when no root is set', async () => {
    await start({ filePath: copyFile });
    await post('/__dynamic_text/update', { path: 'footer.note', value: 'Hi' });
    expect(await readCopy()).toEqual({ text: { hero: { title: 'Original Title' } }, footer: { note: 'Hi' } });
  });

  it('resolves filePath against the Vite root and creates a missing file', async () => {
    await start({ filePath: 'data/new.json' });
    await post('/__dynamic_text/update', { path: 'a', value: 'b' });
    expect(JSON.parse(await fs.promises.readFile(path.join(tmpDir, 'data/new.json'), 'utf-8'))).toEqual({ a: 'b' });
  });

  it.each(['__proto__.polluted', 'constructor.prototype.polluted', 'a..b', '', 'hero.'])(
    'rejects path %j with 400',
    async (bad) => {
      await start();
      const res = await post('/__dynamic_text/update', { path: bad, value: 'x' });
      expect(res.status).toBe(400);
      expect(({} as any).polluted).toBeUndefined();
      expect(await readCopy()).toEqual({ text: { hero: { title: 'Original Title' } } });
    },
  );

  it.each([
    ['/__dynamic_text/update', { path: 'hero.title', value: 42 }],
    ['/__dynamic_text/update', { path: 'hero.title' }],
    ['/__dynamic_text/init', { path: 'hero.x', defaultValue: { nested: true } }],
  ])('rejects non-string values on %s', async (endpoint, body) => {
    await start();
    expect((await post(endpoint, body)).status).toBe(400);
  });

  it('rejects malformed JSON with 400', async () => {
    await start();
    expect((await post('/__dynamic_text/update', '{nope')).status).toBe(400);
  });

  it('rejects bodies over the size cap with 413', async () => {
    await start();
    const res = await post('/__dynamic_text/update', { path: 'hero.title', value: 'x'.repeat(MAX_BODY_BYTES) });
    expect(res.status).toBe(413);
    expect((await readCopy()).text.hero.title).toBe('Original Title');
  });

  it('rejects requests that are not application/json with 415', async () => {
    await start();
    const res = await post('/__dynamic_text/update', { path: 'hero.title', value: 'x' }, { 'Content-Type': 'text/plain' });
    expect(res.status).toBe(415);
  });

  it('rejects cross-origin requests with 403', async () => {
    await start();
    const res = await post('/__dynamic_text/update', { path: 'hero.title', value: 'x' }, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect((await readCopy()).text.hero.title).toBe('Original Title');
  });

  it('accepts same-origin requests', async () => {
    await start();
    const res = await post('/__dynamic_text/update', { path: 'hero.title', value: 'Same' }, { Origin: baseUrl });
    expect(res.status).toBe(200);
  });

  it('answers 409 rather than replacing a string with an object', async () => {
    await start();
    const res = await post('/__dynamic_text/update', { path: 'hero.title.deeper', value: 'x' });
    expect(res.status).toBe(409);
    expect((await readCopy()).text.hero.title).toBe('Original Title');
  });

  it('serialises concurrent writes so none are lost', async () => {
    await start();
    const keys = Array.from({ length: 25 }, (_, i) => `bulk.k${i}`);
    const results = await Promise.all(keys.map((k, i) => post('/__dynamic_text/update', { path: k, value: `v${i}` })));
    expect(results.every((r) => r.ok)).toBe(true);
    const bulk = (await readCopy()).text.bulk;
    expect(Object.keys(bulk)).toHaveLength(keys.length);
  });

  it('preserves indentation and the trailing newline (or its absence)', async () => {
    await writeCopy({ text: { hero: { title: 'T' } } }, 4, false);
    await start();
    await post('/__dynamic_text/update', { path: 'hero.title', value: 'U' });
    const raw = await fs.promises.readFile(copyFile, 'utf-8');
    expect(raw).toBe(JSON.stringify({ text: { hero: { title: 'U' } } }, null, 4));

    await writeCopy({ text: {} }, '\t', true);
    await post('/__dynamic_text/update', { path: 'a', value: 'b' });
    expect(await fs.promises.readFile(copyFile, 'utf-8')).toBe('{\n\t"text": {\n\t\t"a": "b"\n\t}\n}\n');
  });

  it('passes through other requests', async () => {
    await start();
    expect((await fetch(`${baseUrl}/__dynamic_text/update`)).status).not.toBe(200);
    expect((await post('/__dynamic_text/other', {})).status).not.toBe(200);
  });

  it('serves the virtual module with the copy and root', async () => {
    await start();
    const mod = await server.ssrLoadModule('virtual:dynamic-text/copy');
    expect(mod.copy).toEqual({ text: { hero: { title: 'Original Title' } } });
    expect(mod.root).toBe('text');
  });
});

describe('builds', () => {
  it('provides the virtual module and the production DynamicText in an SSR build', async () => {
    const entry = path.join(tmpDir, 'entry.jsx');
    await fs.promises.writeFile(
      entry,
      [
        "import { renderToString } from 'react-dom/server';",
        "import { DynamicText, DynamicTextProvider } from 'vite-plugin-dynamic-text/react';",
        'export const html = renderToString(',
        '  <DynamicTextProvider>',
        '    <DynamicText path="hero.title" as="h1" className="t" />',
        '    <DynamicText path="hero.missing">Fallback</DynamicText>',
        '  </DynamicTextProvider>',
        ');',
      ].join('\n'),
    );
    const outDir = path.join(tmpDir, 'out');
    // Vitest sets NODE_ENV=test, which Vite would otherwise read as a dev build.
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    await build({
      root: tmpDir,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: { 'vite-plugin-dynamic-text/react': path.join(repoRoot, 'src/react/index.ts') },
      },
      plugins: [vitePluginDynamicText({ filePath: copyFile, root: 'text' })],
      build: { ssr: entry, outDir, rollupOptions: { output: { entryFileNames: 'entry.mjs' } } },
    }).finally(() => {
      process.env.NODE_ENV = prevNodeEnv;
    });
    const { html } = await import(pathToFileURL(path.join(outDir, 'entry.mjs')).href);
    expect(html).toBe('<h1 class="t">Original Title</h1><span>Fallback</span>');
  });

  it('inlines the copy into a client build', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'main.js'),
      "import { copy, root } from 'virtual:dynamic-text/copy';\nconsole.log(copy, root);\n",
    );
    const outDir = path.join(tmpDir, 'client-out');
    await build({
      root: tmpDir,
      configFile: false,
      logLevel: 'silent',
      plugins: [vitePluginDynamicText({ filePath: copyFile, root: 'text' })],
      build: { outDir, lib: { entry: 'main.js', formats: ['es'], fileName: 'main' } },
    });
    const [file] = await fs.promises.readdir(outDir);
    const out = await fs.promises.readFile(path.join(outDir, file), 'utf-8');
    expect(out).toContain('Original Title');
  });
});

describe('options', () => {
  it('rejects an invalid root', () => {
    expect(() => vitePluginDynamicText({ root: '__proto__' })).toThrow(/Invalid "root"/);
  });
});
