import { defineConfig } from 'vitest/config';

import { vitePluginDynamicText } from './src/plugin.ts';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'plugin',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        // The React tests get the virtual module from the plugin itself, pointed at a fixture.
        plugins: [vitePluginDynamicText({ filePath: 'test/fixtures/copy.json', root: 'text' })],
        test: {
          name: 'react',
          environment: 'jsdom',
          include: ['test/**/*.test.tsx'],
          setupFiles: ['test/setup.ts'],
        },
      },
    ],
  },
});
