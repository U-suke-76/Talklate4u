import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
          dest: '.',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
          dest: '.',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/ort.all.min.js',
          dest: '.',
        },
        {
          src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx',
          dest: '.',
        },
        {
          src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
          dest: '.',
        },
        {
          src: 'node_modules/@ricky0123/vad-web/dist/bundle.min.js',
          dest: '.',
          rename: 'vad.bundle.min.js',
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'onnxruntime-web': resolve(__dirname, 'src/shims/ort.ts'),
      '@ricky0123/vad-web': resolve(__dirname, 'src/shims/vad.ts'),
    },
  },
  build: {
    sourcemap: false,
    minify: true,
    rollupOptions: {},
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
