import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM + CJS for npm consumers
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
  },
  // IIFE for <script> tag consumers
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    globalName: 'Paperwall',
    outDir: 'dist',
    outExtension: () => ({ js: '.iife.js' }),
    minify: true,
    target: 'es2020',
  },
]);
