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
        'src/features/deco-lattice/model/nineSlice.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
        'src/features/deco-lattice/model/tone.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/deco-lattice/hooks/useLatticeExport.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/art-deco-frame/render/frameMaterial.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/art-deco-frame/render/railGeometry.ts': { statements: 95, branches: 85, functions: 100, lines: 95 },
        'src/features/art-deco-frame/render/ScreenBorderRig.ts': { statements: 100, branches: 85, functions: 100, lines: 100 },
        'src/features/frame-studio/hooks/useFrameStudio.ts': { statements: 95, branches: 75, functions: 95, lines: 95 },
        'src/shared/lib/svgExport.ts': { statements: 95, branches: 90, functions: 100, lines: 95 },
        'src/features/art-deco-frame/engine/frameGrammar/latticeSource.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/shared/lib/prng.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/premiere/model/freeze.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        // ADDENDUM-029: the modules covered by this round's suites. Held at their
        // measured figures so the next change cannot quietly drop them.
        'src/features/qr-generator/useQrGenerator.ts': { statements: 97, branches: 84, functions: 100, lines: 100 },
        'src/features/qr-generator/QrGeneratorModal.tsx': { statements: 100, branches: 86, functions: 100, lines: 100 },
        'src/features/qr-generator/GoldenQrCode.tsx': { statements: 100, branches: 90, functions: 100, lines: 100 },
        'src/features/face-detection/locateFace.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
        'src/features/frame-studio/data/frameDesigns.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
        'src/features/enamel-backdrop/spec.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
        'src/features/spectacle-preview/hooks/useEffectRunner.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/spectacle-preview/hooks/useStageSettings.ts': { statements: 100, branches: 92, functions: 100, lines: 100 },
        'src/features/event-night/components/EventNightStage.tsx': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/event-night/hooks/useEventNight.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
        'src/features/lucky-draw/hooks/useSpinAnimation.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
        'src/features/lucky-draw/hooks/useLuckyDraw.ts': { statements: 100, branches: 88, functions: 100, lines: 100 },
        'src/features/avatar-studio/hooks/useShimmerFrames.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/gilded-portrait/export.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
        'src/features/gilded-portrait/load.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
        'src/features/premiere/scene/responsiveLayout.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        // ADDENDUM-031: the modules this round fixed, extracted or filled in. All of
        // them are now fully exercised; the gate keeps them that way.
        'src/features/premiere/scene/choreography.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/gilded-ui/model/glyphIcons.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/deco-lattice/model/walk.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/gilded-ui/components/GildedNavBar.tsx': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/gilded-ui/components/GildedPanel.tsx': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/lucky-draw/components/LuckyDrawResult.tsx': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/lucky-draw/components/LuckyDrawStage.tsx': { statements: 100, functions: 100, lines: 100 },
        'src/features/event-night/components/TitleMedallion.tsx': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/event-night/components/StageBackdrop.tsx': { statements: 100, functions: 100, lines: 100 },
        'src/features/event-night/EventNightScreen.tsx': { statements: 100, functions: 100, lines: 100 },
        'src/features/qr-generator/QrGeneratorLauncher.tsx': { statements: 100, functions: 100, lines: 100 },
        'src/app/components/OrbitHint.tsx': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/avatar-studio/stage.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/enamel-backdrop/colour.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/features/art-deco-frame/engine/frameGrammar/genome.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/shared/lib/raster/morphology.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
