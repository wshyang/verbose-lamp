import { defineConfig, devices } from '@playwright/test';

// Not the dev server's usual 4173, and never reused: a long-lived dev server can serve modules
// older than the working tree, and a gate that tests yesterday's code is worse than none.
const PORT = Number(process.env.E2E_PORT ?? 4373);
const BASE_URL = `http://localhost:${PORT}`;
const SWIFTSHADER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/**
 * Both are unset in normal use, so Playwright's managed browser is the default. A host with no
 * route to the Playwright download CDN can point these at a Chromium it already has.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const extraArgs = (process.env.PLAYWRIGHT_CHROMIUM_ARGS ?? '').split(/\s+/).filter(Boolean);

/**
 * The browser gates: interaction flows and the likeness (screenshot) suite.
 *
 * WebGL renders on SwiftShader, not a GPU, so the gate is deterministic and runs anywhere, but
 * it proves repeatability, not how the scene looks on real hardware. Baselines are OS-suffixed
 * and only comparable on the same OS, browser and version; re-recording them is a reviewed act.
 */
export default defineConfig({
  testDir: 'e2e',
  // One worker, in order: software GL is CPU-bound, so parallel workers skew each other's timing
  // and make frame-ready waits flaky.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // A cold premiere load alone takes about 15 s on SwiftShader, and a flow can need a minute.
  timeout: 120_000,
  expect: {
    timeout: 30_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2, animations: 'disabled' },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    launchOptions: { executablePath, args: [...SWIFTSHADER_ARGS, ...extraArgs] },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // The desktop engine with a phone viewport and touch: a coarse pointer is what sends the
      // app down its mobile framing path, and a device preset's scale factor would only slow
      // software rendering without changing that path.
      name: 'mobile-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
