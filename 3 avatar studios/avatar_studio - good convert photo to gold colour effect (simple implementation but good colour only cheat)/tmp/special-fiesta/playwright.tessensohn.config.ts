import { defineConfig, devices } from '@playwright/test';
import { FAILURE_EVIDENCE, PORTS, chromiumLaunch, scratchWebServer } from './e2e/support/playwrightCommon.js';

/**
 * ADR-299 — the Tessensohn venue, on a stack of its own.
 *
 * The venue is a property of the whole API process (`PSD_VENUE`, ADR-295), not of a browser
 * session, so it cannot be switched from inside a test: every other spec in this repository runs
 * against one shared stack that is Sentosa. A spec that needs the app to BE Tessensohn gets a
 * stack of its own, the way the full-event run does (ADR-174): its own ports (ADR-344's
 * registry — this suite shared dress-rehearsal's pair before the registry existed, which
 * cross-wired two wipe-on-start stacks), its own PGlite directory wiped before every run,
 * left running beside whatever the developer already had up.
 *
 *   npm run test:e2e:tessensohn
 *
 * Chromium, two workers is fine: nothing here is a singleton. Desktop and mobile projects both
 * run, because the plate's shape against the screen is the thing most likely to break.
 */

const WEB_PORT = PORTS.tessensohn.web;
const API_PORT = PORTS.tessensohn.api;

/** Relative to the API's cwd (apps/api), which is where PGLITE_DATA_DIR is resolved. */
const SCRATCH_DATA_DIR = '.data/e2e-tessensohn';

const launchOptions = chromiumLaunch();

export default defineConfig({
  testDir: './e2e/tessensohn',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results-tessensohn',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    ...FAILURE_EVIDENCE,
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: scratchWebServer({
    webPort: WEB_PORT,
    apiPort: API_PORT,
    dataDir: SCRATCH_DATA_DIR,
    env: { PSD_VENUE: 'tessensohn' },
  }),
});
