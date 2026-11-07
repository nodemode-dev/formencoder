import { fileURLToPath } from 'node:url';

const PORT = 5271;

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: false,
  server: {
    port: PORT,
    host: false,
    strictPort: true,
    fs: { strict: false },
  },
  preview: {
    port: PORT + 1,
    host: false,
    strictPort: true,
  },
  build: {
    outDir: 'assets',
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 200000,
    chunkSizeWarningLimit: 1500,
    lib: {
      entry: 'src/main.ts',
      name: 'FormEncoderDemo',
      formats: ['iife'],
      fileName: () => 'demo.js',
      cssFileName: 'demo',
    },
  },
};
