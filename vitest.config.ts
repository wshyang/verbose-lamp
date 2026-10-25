import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

// Separate from vite.config.ts on purpose: the single-file and Tailwind plugins are
// irrelevant to unit tests, and the project rule forbids editing vite.config.ts.
// The `@` alias mirrors vite.config.ts so pure modules can import feature barrels
// (CLAUDE.md §6) and still run under Vitest (ADDENDUM-018).
// DOM suites opt in per file with `// @vitest-environment jsdom` (ADDENDUM-027 §5).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setupDom.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__snapshots__/**',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      // The gate is on the modules this round added or changed; the global figure
      // is reported honestly in ADDENDUM-027 §7 because the Three.js scene and the
      // untouched HUD components still have no tests.
      thresholds: {
        'src/features/spectacle/model/sparklerPlan.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/spectacle/effects/sparklers/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/spectacle/testing/digest.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/deco-lattice/model/composition.ts': { statements: 90, branches: 80, functions: 100, lines: 95 },
        'src/features/art-deco-frame/engine/frameGrammar/latticeSource.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/shared/lib/prng.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/premiere/model/freeze.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
