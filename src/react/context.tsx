import { copy as initialCopy, root as copyRoot } from 'virtual:dynamic-text/copy';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { INIT_ENDPOINT, UPDATE_ENDPOINT } from '../endpoints.ts';
import { ensureRootObject, resolveCopyValue, setNestedProperty } from '../utils.ts';
import type { DynamicTextAppearance } from './styles.ts';

export interface DynamicTextContextType {
  /** The copy at `path`, or `fallback` (default `''`) when it's missing or empty. */
  getText: (path: string, fallback?: string) => string;
  /** Sets `path` in local state and, in dev, writes it to the copy file. */
  updateText: (path: string, value: string) => Promise<boolean>;
  /** Like `updateText`, but only when `path` is currently missing or empty. */
  initText: (path: string, defaultValue: string) => Promise<boolean>;
  /** Styling for the dev-mode editor, as passed to the provider. */
  appearance: DynamicTextAppearance;
}

export interface DynamicTextProviderProps extends DynamicTextAppearance {
  children?: ReactNode;
}

const root = copyRoot ?? undefined;
const DynamicTextContext = createContext<DynamicTextContextType | null>(null);

function withValue(prev: Record<string, unknown>, pathStr: string, value: string): Record<string, unknown> {
  const cloned = structuredClone(prev);
  try {
    setNestedProperty(ensureRootObject(cloned, root), pathStr, value);
  } catch (err) {
    // An invalid path, or one that runs through a string. The server rejects it too.
    console.error(`[DynamicText] Can't set "${pathStr}":`, err);
    return prev;
  }
  return cloned;
}

async function persist(endpoint: string, body: Record<string, string>): Promise<boolean> {
  if (!import.meta.env.DEV) return true;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`[DynamicText] Failed to save "${body.path}": HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error(`[DynamicText] Failed to save "${body.path}":`, err);
    return false;
  }
}

function readText(data: unknown, pathStr: string, fallback?: string): string {
  const val = resolveCopyValue(data, pathStr, root);
  return val !== undefined && val !== '' ? val : (fallback ?? '');
}

export function DynamicTextProvider({ children, classNames, styles, unstyled }: DynamicTextProviderProps) {
  const [copyState, setCopyState] = useState<Record<string, unknown>>(() => structuredClone(initialCopy));

  const getText = useCallback(
    (pathStr: string, fallback?: string) => readText(copyState, pathStr, fallback),
    [copyState],
  );

  const updateText = useCallback(async (pathStr: string, value: string) => {
    setCopyState((prev) => withValue(prev, pathStr, value));
    return persist(UPDATE_ENDPOINT, { path: pathStr, value });
  }, []);

  const initText = useCallback(
    async (pathStr: string, defaultValue: string) => {
      if (readText(copyState, pathStr) !== '') return false;
      setCopyState((prev) => withValue(prev, pathStr, defaultValue));
      return persist(INIT_ENDPOINT, { path: pathStr, defaultValue });
    },
    [copyState],
  );

  const appearance = useMemo(() => ({ classNames, styles, unstyled }), [classNames, styles, unstyled]);
  const value = useMemo(
    () => ({ getText, updateText, initText, appearance }),
    [getText, updateText, initText, appearance],
  );

  return <DynamicTextContext.Provider value={value}>{children}</DynamicTextContext.Provider>;
}

const staticContext: DynamicTextContextType = {
  getText: (pathStr, fallback) => readText(initialCopy, pathStr, fallback),
  updateText: async () => false,
  initText: async () => false,
  appearance: {},
};

/** Reads the provider, or falls back to read-only access to the copy file outside one. */
export function useDynamicText(): DynamicTextContextType {
  return useContext(DynamicTextContext) ?? staticContext;
}
