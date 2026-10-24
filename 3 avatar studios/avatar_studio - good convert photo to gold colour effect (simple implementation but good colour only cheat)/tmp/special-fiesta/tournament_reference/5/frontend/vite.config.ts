import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
