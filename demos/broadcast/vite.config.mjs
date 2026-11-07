import { fileURLToPath } from 'node:url';

const PORT = 5273;

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
    emptyOutDir: false,
    target: 'es2022',
    minify: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 200000,
    chunkSizeWarningLimit: 1500,
    lib: {
      entry: 'src/main.ts',
      name: 'FormEncoderBroadcastDemo',
      formats: ['iife'],
      fileName: () => 'broadcast.js',
      cssFileName: 'broadcast',
    },
  },
};
