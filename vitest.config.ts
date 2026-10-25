import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

// Separate from vite.config.ts on purpose: the single-file and Tailwind plugins are
// irrelevant to node unit tests, and the project rule forbids editing vite.config.ts.
// The `@` alias mirrors vite.config.ts so pure modules can import feature barrels
// (CLAUDE.md §6) and still run under Vitest (ADDENDUM-018).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  test: {
    // Node by default; DOM suites opt in per-file (`// @vitest-environment jsdom`).
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setupDom.ts'],
    // Coverage gate (ADDENDUM-029): 100% of the pure layer — every `.ts`
    // module that decides without a browser or GPU. Excluded, by rule:
    // rendering (`.tsx`, owned by DOM suites + the Playwright gate), React
    // lifecycle glue (hooks), Three.js/WebAudio hosts, and thin browser
    // wrappers (downloads, image decode, DOM canvas surfaces) whose logic
    // lives in covered pure modules they delegate to.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        // Tests and test support.
        '**/*.test.ts',
        '**/__snapshots__/**',
        'src/test/**',
        'src/**/testing/**',
        '**/*.d.ts',
        // Render layer (also outside the `.ts` include, but Vitest reports
        // executed files regardless; exclude explicitly).
        '**/*.tsx',
        // React lifecycle glue: hooks decide by delegating to covered models.
        '**/hooks/**',
        'src/**/use*.ts',
        // Three.js / WebAudio hosts (pixel layer; Playwright gate owns them).
        'src/features/premiere/scene/GatsbySceneManager.ts',
        'src/features/premiere/scene/decoCards.ts',
        'src/features/premiere/scene/environment.ts',
        'src/features/premiere/audio/**',
        'src/features/art-deco-frame/render/**',
        // Browser-host wrappers with no logic beyond serialisation/decode.
        'src/features/qr-generator/export.ts',
        'src/features/gilded-portrait/export.ts',
        'src/features/gilded-portrait/load.ts',
        'src/features/spectacle/engine/layers.ts',
        'src/features/spectacle/engine/createSpectacleStage.ts',
      ],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
