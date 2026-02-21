import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  banner: { js: '#!/usr/bin/env node' },
  treeshake: true,
  clean: true,
  dts: false,
  external: ['@napi-rs/keyring'],
});
