import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['frontend/src/testSetup.ts'],
    include: ['shared/**/*.test.ts', 'backend/**/*.test.ts', 'frontend/src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['shared/**/*.ts', 'backend/**/*.ts', 'frontend/src/**/*.{ts,tsx}'],
      // shared/types.ts is type-only (no runtime code) and is excluded for that reason.
      exclude: ['**/*.test.{ts,tsx}', 'shared/types.ts', 'frontend/src/testSetup.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
