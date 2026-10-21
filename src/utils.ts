/** Path segments that would let a key reach `Object.prototype` through `setNestedProperty`. */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Splits a dot-notated key into segments, or returns `null` when the key is unusable: empty,
 * containing an empty segment (`a..b`, `.a`, `a.`), or naming a prototype property.
 */
export function parsePath(pathStr: string): string[] | null {
  if (typeof pathStr !== 'string' || pathStr === '') return null;
  const parts = pathStr.split('.');
  for (const part of parts) {
    if (part === '' || FORBIDDEN_SEGMENTS.has(part)) return null;
  }
  return parts;
}

export function getNestedProperty(obj: unknown, pathStr: string): unknown {
  const parts = parsePath(pathStr);
  if (!parts) return undefined;
  let curr: unknown = obj;
  for (const part of parts) {
    if (!isObject(curr) || !Object.hasOwn(curr, part)) return undefined;
    curr = curr[part];
  }
  return curr;
}

/**
 * Sets a nested key, creating intermediate objects as needed. Throws on an invalid path, or
 * when an intermediate segment already holds a non-object value (overwriting it would
 * silently destroy copy).
 */
export function setNestedProperty(obj: JsonObject, pathStr: string, value: unknown): void {
  const parts = parsePath(pathStr);
  if (!parts) throw new Error(`Invalid copy path "${pathStr}"`);
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = Object.hasOwn(curr, part) ? curr[part] : undefined;
    if (next === undefined || next === null) {
      curr[part] = {};
    } else if (!isObject(next)) {
      throw new Error(`Cannot set "${pathStr}": "${parts.slice(0, i + 1).join('.')}" is not an object`);
    }
    curr = curr[part] as JsonObject;
  }
  curr[parts[parts.length - 1]] = value;
}

/** Returns the object that keys resolve from: the whole file, or `data[root]` when a root is set. */
export function getRootObject(data: unknown, root: string | undefined): unknown {
  if (!root) return data;
  return getNestedProperty(data, root);
}

/** Like `getRootObject`, but creates the root object if it's missing. */
export function ensureRootObject(data: JsonObject, root: string | undefined): JsonObject {
  if (!root) return data;
  const existing = getNestedProperty(data, root);
  if (isObject(existing)) return existing;
  setNestedProperty(data, root, {});
  return getNestedProperty(data, root) as JsonObject;
}

/** Resolves a copy key to a string, or `undefined` when it's missing or not a scalar. */
export function resolveCopyValue(data: unknown, pathStr: string, root?: string): string | undefined {
  const val = getNestedProperty(getRootObject(data, root), pathStr);
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return undefined;
}
