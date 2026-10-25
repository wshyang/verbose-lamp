import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * The coverage gate measures the *logic surface*. Everything else is excluded by rule,
 * with a reason, so the contract is auditable instead of implied (ADDENDUM-027):
 *
 * - tests and snapshots: they are the measurement, not the subject.
 * - `src/test/setupDom.ts`: environment shims, exercised by its own test but not logic.
 * - `.tsx` components: DOM. Correctness lives in the hooks and pure modules they call
 *   (CLAUDE.md §2: "a component renders, a hook decides"); they get jsdom tests for
 *   wiring, which add breadth without being gated here.
 * - `render/` and the three imperative scene files: WebGL / Canvas builders and the
 *   Three.js scene graph. They need a GPU, so they are exercised through the pure planners
 *   they consume and, later, by the browser likeness gate. CLAUDE.md §2 keeps rendering
 *   thin and explicitly not unit-tested. Scene files are excluded by name, never by
 *   folder: pure modules that live beside them (`responsiveLayout`, `shaders/`, and the
 *   choreography seams added later) are logic and stay measured.
 * - `src/main.tsx`, `vite-env.d.ts`: bootstrap and ambient types.
 */
export const COVERAGE_EXCLUDES = [
  'src/**/*.test.{ts,tsx}',
  'src/**/__snapshots__/**',
  'src/test/setupDom.ts',
  'src/**/*.tsx',
  'src/**/render/**',
  'src/features/premiere/scene/GatsbySceneManager.ts',
  'src/features/premiere/scene/decoCards.ts',
  'src/features/premiere/scene/environment.ts',
  'src/vite-env.d.ts',
];

const FULL = { statements: 100, branches: 100, functions: 100, lines: 100 } as const;

/**
 * Global floors are a ratchet at the logic-surface level measured when this gate was
 * introduced (65.3 % statements, 64.3 % branches, 58.5 % functions, 65.7 % lines, raised to 66.3 / 65.8 / 60.0 / 66.7 by Phase 1, with
 * every non-excluded file counted, loaded by a test or not): raise them whenever a phase
 * raises coverage, never lower them. Modules
 * the integration adds or rewrites are named below at 100% as they land, so a later
 * change cannot quietly drop them.
 */
const GLOBAL_FLOORS = { statements: 66, branches: 65, functions: 60, lines: 66 } as const;

// Separate from vite.config.ts on purpose: the single-file and Tailwind plugins are
// irrelevant to node unit tests, and the project rule forbids editing vite.config.ts.
// The `@` alias mirrors vite.config.ts so pure modules can import feature barrels
// (CLAUDE.md §6) and still run under Vitest (ADDENDUM-018).
// DOM suites opt in per file with `// @vitest-environment jsdom`; `setupDom.ts` is a no-op
// in the node environment.
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
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: COVERAGE_EXCLUDES,
      thresholds: {
        ...GLOBAL_FLOORS,
        'src/test/digest.ts': FULL,
        'src/features/premiere/scene/shaders/glslDeclarations.ts': FULL,
        'src/features/premiere/model/freeze.ts': FULL,
        'src/features/premiere/scene/choreography.ts': FULL,
        'src/features/premiere/scene/orbitFocus.ts': FULL,
        'src/features/premiere/scene/styleClamp.ts': FULL,
        'src/features/premiere/scene/playback.ts': FULL,
        'src/features/premiere/scene3d/premiereStore.ts': FULL,
      },
    },
  },
});
