import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // PGlite is single-connection; one worker per file keeps each suite's database isolated.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/tests/**',
        // Process entrypoints (ADR-013). `index.ts` binds a socket and never returns; the
        // CLIs are offline shells around ensureSchema/seedDatabase/ensureDemoData, all of
        // which bootstrap.test.ts exercises directly — and the demo export's real proof is
        // the generated seed-demo.sql booting a working server (ADR-102).
        'src/index.ts',
        'src/db/setup-cli.ts',
        'src/db/demo-export-cli.ts',
      ],
      /*
       * A ratchet, not an aspiration (ADR-080) — see the twin comment in apps/web/vite.config.ts.
       * These sat at 100 while `npm test` ran plain `vitest run`, so nothing evaluated them and the
       * real figure drifted to 97 %. Today's actual is the floor; it may only be raised.
       */
      // branches stays at 94.6 and must NOT be ratcheted to the figure a green run prints:
      // schedule.ts:575 (`index >= Math.max(1, courtCount)`) is covered or not depending on how
      // the parallel suites share the 5-court pool, so the reading oscillates 94.6/94.66 across
      // identical runs. Pinning the high-water mark makes `npm run verify` fail about one run
      // in three on an unchanged tree.
      thresholds: { lines: 98, functions: 98.9, branches: 94.6, statements: 98 },
    },
  },
});
