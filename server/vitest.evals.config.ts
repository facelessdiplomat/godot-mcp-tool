import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/evals/**/*.eval.ts'],
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
