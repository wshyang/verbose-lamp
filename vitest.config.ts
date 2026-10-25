import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * The surface that must stay at 100% (ADDENDUM-025 §3.4): every logic module.
 * Renderers and scene graphs are excluded *by path and with a reason*, so the
 * contract is auditable instead of implied:
 *
 * - `.tsx` React components: DOM. Covered by the Phase 1 jsdom tests, asserted
 *   separately, and never a place where correctness lives (CLAUDE.md §2).
 * - The render, scene and scene3d folders: WebGL / Canvas builders and the
 *   Three.js scene graph. They need a GPU, so they are exercised through the pure
 *   planners they consume.
 * - `GatsbySceneManager.ts`: the imperative renderer that the R3F port replaces.
 * - `src/test/**`: test infrastructure itself.
 */
export const LOGIC_SURFACE_EXCLUDES = [
  'src/**/*.tsx',
  'src/**/render/**',
  'src/**/scene/**',
  'src/**/scene3d/**',
  'src/features/premiere/scene/GatsbySceneManager.ts',
  'src/test/**',
  'src/vite-env.d.ts',
];

// Separate from vite.config.ts on purpose: the single-file and Tailwind plugins are
// irrelevant to node unit tests, and the project rule forbids editing vite.config.ts.
// The `@` alias mirrors vite.config.ts so pure modules can import feature barrels
// (CLAUDE.md §6) and still run under Vitest (ADDENDUM-018).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  test: {
    // Node stays the default environment; DOM suites opt in with a file-level
    // `// @vitest-environment jsdom` comment (ADDENDUM-022 §1.1).
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setupDom.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: LOGIC_SURFACE_EXCLUDES,
    },
  },
});
