import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { defineConfig, devices, webkit } from '@playwright/test';
import { chromiumLaunch, ownStackIgnore, videoPolicy } from './e2e/support/playwrightCommon.js';

/**
 * E2E drives the real UI against a real backend with no mocks (AGENTS-testing.md §5–§6).
 *
 * Video is ON by default — a suite that is blind on failure is worse than no suite. The single
 * documented off-switch is `PSD_E2E_VIDEO=off`.
 *
 * Start the stack first (`npm run dev`) or let `webServer` below do it. The specs provision
 * their own data through the app's own APIs; nothing is written behind the UI's back.
 */

const baseURL = process.env['PSD_E2E_BASE_URL'] ?? 'http://127.0.0.1:5173';

/**
 * The selfie viewfinder (ADR-042) needs a camera in CI, and each engine supplies its own:
 * Chromium takes the two fake-media flags below (a test pattern into `getUserMedia`, and
 * the permission prompt auto-granted), while Playwright's WebKit already boots with its
 * own mock capture devices — a `getUserMedia` track there reports itself as
 * `Mock video device 1`, so no flag and no physical camera is involved on either engine.
 * The Chromium flags are inert for tests that never touch a camera, and must not leak
 * into a WebKit launch, hence the empty per-project `launchOptions` below (ADR-044).
 */
const cameraArgs = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
/** ADR-344 — the executable/flags stanza lives in one place now: e2e/support/playwrightCommon.ts. */
const launchOptions = chromiumLaunch(cameraArgs);

/**
 * ADR-041/043 — the beach's phones are Android Chrome AND iPhone Safari, so **both
 * engines run by default**. Playwright's WebKit is the Safari engine and ships no
 * FaceDetector, exactly like iOS, so the photo suite's "nothing available" premise is
 * natively true there and the injected stand-ins still work (they are plain JavaScript).
 *
 * `PSD_E2E_ENGINES` narrows the run: `chromium`, `webkit`, or `all`. Asking for WebKit
 * on a host that has not fetched it is a loud failure, never a silently halved run;
 * leaving the knob unset on such a host falls back to Chromium with a warning, so a
 * first clone still gets a green suite. `PSD_E2E_WEBKIT=1` is kept as an alias for `all`.
 */
type Engine = 'chromium' | 'webkit';

const INSTALL_HINT = 'run `npm run e2e:install` (needs the Playwright browser CDN)';

function webkitIsInstalled(): boolean {
  try {
    return existsSync(webkit.executablePath());
  } catch {
    return false;
  }
}

const CHROMIUM_ONLY: Engine[] = ['chromium'];
const BOTH_ENGINES: Engine[] = ['chromium', 'webkit'];

const ASKED: Record<string, Engine[] | undefined> = {
  chromium: CHROMIUM_ONLY,
  webkit: ['webkit'],
  all: BOTH_ENGINES,
};

function enginesToRun(): Engine[] {
  const asked = process.env['PSD_E2E_ENGINES'] ?? (process.env['PSD_E2E_WEBKIT'] === '1' ? 'all' : '');
  if (asked === '') return defaultEngines();
  const engines = ASKED[asked];
  if (engines === undefined) {
    throw new Error(`PSD_E2E_ENGINES must be chromium, webkit or all — got "${asked}"`);
  }
  if (engines.includes('webkit') && !webkitIsInstalled()) {
    throw new Error(`PSD_E2E_ENGINES=${asked} needs WebKit — ${INSTALL_HINT}`);
  }
  return engines;
}

/** Unset means both, because both are on the beach — unless this host has no WebKit yet. */
function defaultEngines(): Engine[] {
  if (webkitIsInstalled()) return BOTH_ENGINES;
  console.warn(`[e2e] WebKit is not installed — running Chromium only. To add the Safari engine, ${INSTALL_HINT}.`);
  return CHROMIUM_ONLY;
}

// The event is run from phones on a beach; that is the shape the suite must prove first.
const PROJECTS: Record<Engine, { name: string; use: Record<string, unknown> }[]> = {
  chromium: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webkit: [
    { name: 'mobile-safari', use: { ...devices['iPhone 15'], launchOptions: {} } },
    { name: 'desktop-safari', use: { ...devices['Desktop Safari'], launchOptions: {} } },
  ],
};

/**
 * How many spec FILES run at once.
 *
 * `PSD_E2E_WORKERS=1` is the documented way back to a strictly serial run, and is the first
 * thing to try if a failure looks like two specs talking to each other. Default is half the
 * cores: every worker drives a real browser against one shared backend, so the ceiling here is
 * memory and database contention, not CPU.
 */
function workerCount(): number {
  const asked = process.env['PSD_E2E_WORKERS'];
  if (asked !== undefined && asked !== '') {
    const parsed = Number.parseInt(asked, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`PSD_E2E_WORKERS must be a positive integer — got "${asked}"`);
    }
    return parsed;
  }
  return Math.max(1, Math.floor(cpus().length / 2));
}

export default defineConfig({
  testDir: './e2e',
  /*
   * ADR-174/344 — every suite that runs on a stack of its own (a singleton mutation or a
   * process-wide venue) is ignored here, so `playwright test` with no arguments means "the
   * suite that is safe to run against the shared dev stack" — and keeps meaning it, because
   * the list is the one `OWN_STACK_DIRS` the standards rule `e2e-stack-coverage` checks
   * against the root configs. A new own-stack suite that forgets to join the list fails
   * `npm run standards`, not the shared database.
   */
  testIgnore: ownStackIgnore(),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  /*
   * Files run in parallel; the tests INSIDE a file stay in order.
   *
   * `fullyParallel: true` would also scatter the tests within a file across workers, and much
   * of this suite is written as a journey — sign up in the first test, then act as that person
   * in the next. Those would break, and they would break as flakes. A file that genuinely has
   * independent tests opts in for itself with `test.describe.configure({ mode: 'parallel' })`,
   * which is a local claim its own author can verify.
   *
   * The backend is shared and is NOT reset between files, so parallel files must not fight over
   * global state. Two rules keep that true: provision through the app's APIs under a
   * worker-unique `runId` (see e2e/support/fixtures.ts), and put anything that mutates a
   * singleton — the tournament, the point config, the station-offline switch — in
   * `e2e/exclusive/`, which runs on its own afterwards.
   */
  fullyParallel: false,
  workers: workerCount(),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL,
    launchOptions,
    video: videoPolicy(),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: enginesToRun().flatMap((engine) => PROJECTS[engine]),
  // exactOptionalPropertyTypes: the property is absent when the stack is external, never
  // present-and-undefined (the same rule the app's own option objects follow).
  ...(process.env['PSD_E2E_NO_SERVER']
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          // Vite answers before the API has migrated; wait for the whole stack, not the door.
          url: `${baseURL}/api/health`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
