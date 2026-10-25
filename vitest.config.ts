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
  'src/features/premiere/scene/decoCards.ts',
  'src/features/premiere/scene/environment.ts',
  'src/vite-env.d.ts',
];

const FULL = { statements: 100, branches: 100, functions: 100, lines: 100 } as const;

/**
 * The global gate is the full logic surface at 100 %. It started as a ratchet at the figures
 * measured when the gate was introduced (65.3 / 64.3 / 58.5 / 65.7) and was raised phase by phase;
 * ADDENDUM-036 closed the last gap. It holds without a single `v8 ignore`: a guard no test can
 * reach was removed or made structural, not hidden. Anything the rules above exclude is excluded
 * by name and reason, so the number cannot be bought with an exclude added later without
 * editing that list in review.
 */
const GLOBAL_FLOORS = FULL;

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
        'src/test/frameCompare.ts': FULL,
        'src/features/premiere/scene/choreography.ts': FULL,
        'src/features/premiere/scene/orbitFocus.ts': FULL,
        'src/features/premiere/scene/styleClamp.ts': FULL,
        'src/features/premiere/scene/playback.ts': FULL,
        'src/features/premiere/scene3d/premiereStore.ts': FULL,
        'src/features/premiere/scene3d/storeSceneApi.ts': FULL,
        'src/features/premiere/scene3d/pointerAim.ts': FULL,
        'src/features/premiere/scene3d/usePointerAim.ts': FULL,
        'src/features/premiere/scene3d/applyRendererLook.ts': FULL,
        'src/features/premiere/scene3d/composer.ts': FULL,
        'src/features/deco-lattice/model/clip.ts': FULL,
        'src/features/deco-lattice/model/walk.ts': FULL,
        'src/features/deco-lattice/model/nineSlice.ts': FULL,
        'src/features/deco-lattice/model/motifs.ts': FULL,
        'src/features/deco-lattice/model/tone.ts': FULL,
        'src/features/spectacle/model/sparklerPlan.ts': FULL,
        'src/features/spectacle/effects/sparklers/sparklerWand.ts': FULL,
        'src/features/spectacle/effects/sparklers/sparkSpray.ts': FULL,
        'src/features/spectacle/effects/sparklers/transitionPose.ts': FULL,
        'src/features/spectacle/effects/sparklers/transitionFlash.ts': FULL,
        'src/features/spectacle/effects/sparklers/sparklerWire.ts': FULL,
        'src/features/spectacle/effects/sparklers/sparklerTransitionEffect.ts': FULL,
        'src/features/spectacle/effects/sparklers/sparklersEffect.ts': FULL,
        'src/features/spectacle-preview/hooks/useSpeakerDrag.ts': FULL,
        'src/features/spectacle/effects/sparklers/sparklerRenderer.ts': FULL,
        'src/features/spectacle/engine/effectRegistry.ts': FULL,
        'src/shared/lib/svgExport.ts': FULL,
        'src/shared/lib/fonts.ts': FULL,
        'src/shared/hooks/useEscapeKey.ts': FULL,
        'src/features/gilded-ui/model/glyphIcons.ts': FULL,
        'src/features/gilded-ui/model/navItems.ts': FULL,
        'src/features/premiere/hooks/usePremiereShortcuts.ts': FULL,
        'src/shared/hooks/useDialogFocus.ts': FULL,
        'src/features/art-deco-frame/engine/frameGrammar/latticeSource.ts': FULL,
        'src/features/frame-studio/model/patternSeed.ts': FULL,
      },
    },
  },
});
