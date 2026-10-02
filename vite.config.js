import { defineConfig } from 'vite';
export default defineConfig({
  root: 'viewer', base: './',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 850 },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
