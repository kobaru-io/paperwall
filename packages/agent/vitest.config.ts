import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/server/types.ts',
        'dist/**',
        'tsup.config.ts',
        'vitest.config.ts',
      ],
    },
  },
});
