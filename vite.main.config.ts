import { defineConfig } from 'vite';

import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'src/overlay',
          dest: '.',
        },
      ],
    }),
  ],
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['es'],
      fileName: 'main',
    },
    commonjsOptions: {
      ignoreDynamicRequires: true,
    },
    rollupOptions: {
      external: [
        'electron',
        'nodejs-whisper',
        'onnxruntime-web',
        'bufferutil',
        'utf-8-validate',
        'express',
        'socket.io',
      ],
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        banner: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`,
      },
    },
    minify: true,
    sourcemap: false,
  },
});
