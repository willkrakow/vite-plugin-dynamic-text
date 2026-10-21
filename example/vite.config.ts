import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dynamicText from 'vite-plugin-dynamic-text';

export default defineConfig({
  plugins: [react(), dynamicText({ root: 'text' })],
});
