import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,js}'],
    exclude: ['test/integration/**', 'node_modules/**'],
    testTimeout: 20_000,
  },
});
