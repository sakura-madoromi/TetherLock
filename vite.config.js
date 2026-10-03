import { defineConfig } from 'vite';
export default defineConfig({
  root: 'apps/workbench', base: './',
  build: { outDir: '../../generated/workbench/dist', emptyOutDir: true, chunkSizeWarningLimit: 850 },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
