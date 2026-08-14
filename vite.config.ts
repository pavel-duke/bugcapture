import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'popup.html'),
        offscreen: resolve(import.meta.dirname, 'offscreen.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
        content: resolve(import.meta.dirname, 'src/content/index.ts'),
        'page-bridge': resolve(import.meta.dirname, 'src/content/page-bridge.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
