import { defineConfig, devices } from '@playwright/test';
import { FAILURE_EVIDENCE, PORTS, chromiumLaunch, scratchWebServer } from './e2e/support/playwrightCommon.js';

/**
 * ADR-350 — the load tier's cast-driven mode (the plan's §5, Phase 4): the `live-room-at-300`
 * spec, which spawns the load CLI as a child process against this stack and plays its beats
 * through a real ADR-347 cast while the engine's synthetic users hold the room.
 *
 *   npm run test:e2e:load
 *
 * `PSD_E2E_LOAD_USERS` sets the population — the default is the 25-user shakeout; the
 * MacBook's claim run takes 300 (fds.md's ceiling). Chromium only, one worker: several live
 * SSE contexts per browser is the shape the cast suite already proved stays well-behaved,
 * and the engine's own sharding covers the population side.
 */

const WEB_PORT = PORTS.load.web;
const API_PORT = PORTS.load.api;

/** Relative to the API's cwd (apps/api), where PGLITE_DATA_DIR is resolved. */
const SCRATCH_DATA_DIR = '.data/e2e-load';

export default defineConfig({
  testDir: './e2e/load',
  // The engine's own tests in this directory are vitest's (`npm run test:e2e:unit`) —
  // Playwright must not load them (ADR-350's one rule, stated in playwrightCommon.ts).
  testMatch: '*.spec.ts',
  timeout: 20 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results-load',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    ...devices['Desktop Chrome'],
    launchOptions: chromiumLaunch(),
    ...FAILURE_EVIDENCE,
    actionTimeout: 20_000,
  },
  webServer: scratchWebServer({ webPort: WEB_PORT, apiPort: API_PORT, dataDir: SCRATCH_DATA_DIR }),
});
