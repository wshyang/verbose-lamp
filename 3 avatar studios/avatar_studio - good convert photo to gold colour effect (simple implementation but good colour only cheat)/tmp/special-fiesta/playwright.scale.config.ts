import { defineConfig, devices } from '@playwright/test';
import { FAILURE_EVIDENCE, PORTS, chromiumLaunch, scratchWebServer } from './e2e/support/playwrightCommon.js';

/**
 * ADR-348/349 — the scale run: fds.md §1's documented floor approached by an adaptive browser
 * crowd on a machine with room for it. The resource monitor feeds the admission controller,
 * the controller grows the crowd one way (never prunes for resources), and the unprunable core
 * cast carries every load-bearing assertion. Telemetry lands in `test-results-scale/` beside
 * the artifacts — the attribution record that separates load flake from product bug.
 *
 *   npm run test:e2e:scale
 *
 * `PSD_E2E_SCALE_CEILING` caps the crowd (the skeleton spec defaults it to 25 — a shakeout —
 * while the day spec will take the plan's 120).
 *
 * Chromium only, one worker, and a stack of its own (ADR-344's registry): the day activates
 * the tournament, and a wipe-on-start stack under sustained load is nobody's shared dev
 * database. The crowd's own browsers are launched by the harness with no video — the evidence
 * policy is the CORE cast's job (ADR-347); a hundred videos would be terabytes, not evidence.
 */

const WEB_PORT = PORTS.scale.web;
const API_PORT = PORTS.scale.api;

/** Relative to the API's cwd (apps/api), which is where PGLITE_DATA_DIR is resolved. */
const SCRATCH_DATA_DIR = '.data/e2e-scale';

export default defineConfig({
  testDir: './e2e/scale',
  // The climb alone can take minutes; the day beats ride on top of it.
  timeout: 20 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results-scale',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    ...devices['Desktop Chrome'],
    launchOptions: chromiumLaunch(),
    ...FAILURE_EVIDENCE,
    actionTimeout: 20_000,
  },
  webServer: scratchWebServer({ webPort: WEB_PORT, apiPort: API_PORT, dataDir: SCRATCH_DATA_DIR }),
});
