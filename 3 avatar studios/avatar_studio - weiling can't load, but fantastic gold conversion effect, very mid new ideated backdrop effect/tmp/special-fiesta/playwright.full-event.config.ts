import { defineConfig, devices } from '@playwright/test';
import { FAILURE_EVIDENCE, PORTS, chromiumLaunch, scratchWebServer } from './e2e/support/playwrightCommon.js';

/**
 * ADR-174 — the full-event run, on a database of its own.
 *
 * Every other spec in this repository provisions through the app's APIs under a unique run id
 * and shares one long-lived dev database. That works because nothing they do is a singleton.
 * The tournament is: `tournament` is one row per database, activation cannot be undone through
 * any UI, and a second activation is refused with `tournamentAlreadyActive`. The existing
 * knockout spec therefore stops deliberately at the plan and never activates, and says so.
 *
 * A spec that plays a whole eight-team day has no such option — it must activate. So it gets a
 * stack of its own: its own PGlite directory, wiped before every run, on its own ports
 * (ADR-344's registry), left running beside whatever the developer already had up. Nothing it
 * does can reach the shared dev database, and it is re-runnable without anybody remembering
 * to reset anything.
 *
 *   npm run test:e2e:full-event
 *
 * Chromium only, and one worker. The spec is a single ordered narrative against a singleton
 * tournament, so a second worker would have nothing to do but collide with the first; and the
 * thing under test is the event's arithmetic, not how two engines paint a button.
 */

const WEB_PORT = PORTS.fullEvent.web;
const API_PORT = PORTS.fullEvent.api;

/** Relative to the API's cwd (apps/api), which is where PGLITE_DATA_DIR is resolved. */
const SCRATCH_DATA_DIR = '.data/e2e-full-event';

export default defineConfig({
  testDir: './e2e/full-event',
  // Fifteen matches, each played through a real console with confirmations.
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results-full-event',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    ...devices['Desktop Chrome'],
    launchOptions: chromiumLaunch(),
    ...FAILURE_EVIDENCE,
    actionTimeout: 20_000,
  },
  webServer: scratchWebServer({ webPort: WEB_PORT, apiPort: API_PORT, dataDir: SCRATCH_DATA_DIR }),
});
