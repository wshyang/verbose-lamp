import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/tests/**', 'src/index.ts', 'src/core/index.ts', 'src/scheduler/index.ts', 'src/core/types.ts', 'src/scheduler/types.ts'],
      // ADR-080 — a ratchet: set from the first measured run, raised only.
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
