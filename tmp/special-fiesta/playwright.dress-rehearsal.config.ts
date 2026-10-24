import { defineConfig, devices } from '@playwright/test';
import { FAILURE_EVIDENCE, PORTS, chromiumLaunch, scratchWebServer } from './e2e/support/playwrightCommon.js';

/**
 * ADR-335 — the day-of dress rehearsal, on a database of its own.
 *
 * Like the full-event run (ADR-174), this spec activates the singleton tournament, so it
 * cannot share the dev database or the full-event database. It gets its own PGlite
 * directory, wiped on start, and its own ports (ADR-344's registry):
 *
 *   npm run test:e2e:dress-rehearsal
 *
 * Chromium only, and one worker: the rehearsal is one ordered day, not a load test.
 */

const WEB_PORT = PORTS.dressRehearsal.web;
const API_PORT = PORTS.dressRehearsal.api;

/** Relative to the API's cwd (apps/api), which is where PGLITE_DATA_DIR is resolved. */
const SCRATCH_DATA_DIR = '.data/e2e-dress-rehearsal';

export default defineConfig({
  testDir: './e2e/dress-rehearsal',
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results-dress-rehearsal',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    ...devices['Desktop Chrome'],
    launchOptions: chromiumLaunch(),
    ...FAILURE_EVIDENCE,
    actionTimeout: 20_000,
  },
  webServer: scratchWebServer({ webPort: WEB_PORT, apiPort: API_PORT, dataDir: SCRATCH_DATA_DIR }),
});
