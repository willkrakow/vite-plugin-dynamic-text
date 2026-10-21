// Types for the virtual module served by vite-plugin-dynamic-text. Reference this file from
// a `.d.ts` in your project if you import the module yourself:
//
//   /// <reference types="vite-plugin-dynamic-text/client" />

declare module 'virtual:dynamic-text/copy' {
  /** The parsed contents of the configured copy file. */
  export const copy: Record<string, unknown>;
  /** The plugin's `root` option, or `null` when keys resolve from the top of the file. */
  export const root: string | null;
  export default copy;
}
