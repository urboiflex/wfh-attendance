import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
