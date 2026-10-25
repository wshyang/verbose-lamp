import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

// Separate from vite.config.ts on purpose: the single-file and Tailwind plugins are
// irrelevant to tests, and the project rule forbids editing vite.config.ts.
// The `@` alias mirrors vite.config.ts so pure modules can import feature barrels
// (CLAUDE.md §6) and still run under Vitest (ADDENDUM-018).
//
// `environment: 'node'` stays the default: pure modules run fastest there. Tests that
// touch the DOM declare `// @vitest-environment jsdom` in their first line, per
// ADDENDUM-022 §5. `setupFiles` runs in both environments and only installs DOM
// shims when a document exists (ADDENDUM-025).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setupDom.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'json', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
        'src/vite-env.d.ts',
      ],
      // 100% is the target and the gate. See docs/addenda/ADDENDUM-025.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
