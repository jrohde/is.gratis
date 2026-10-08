import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/tests/global-setup.ts'],
    // Test files share one database, so run them one after another.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
