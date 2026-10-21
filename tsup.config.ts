import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  // `import.meta.env.DEV` and the virtual module are resolved by the consumer's Vite build.
  external: ['react', 'react/jsx-runtime', 'vite', 'virtual:dynamic-text/copy'],
});
