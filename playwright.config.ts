import { defineConfig } from '@playwright/test';

/**
 * The likeness gate (ADDENDUM-022 Phase 0, recorded in ADDENDUM-027).
 *
 * Baselines are captured by the user in a real browser — this sandbox has none.
 * Once `e2e/snapshots/` exists, `npm run e2e` fails on any visual drift in the
 * premiere. Re-baselining (`npm run e2e:update`) needs its own addendum.
 */
/**
 * Some hosts (CI images, sandboxes) already ship a Chromium build instead of
 * downloading one. Point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at it and the config
 * uses that binary; otherwise Playwright resolves its own download.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  // Software GL is slow: a cold premiere load takes ~15 s on SwiftShader, and
  // a whole flow can need a minute once panels animate.
  timeout: 120_000,
  expect: {
    // Stable-screenshot capture under software GL needs several frames.
    timeout: 60_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2, animations: 'disabled' },
  },
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      executablePath,
      // Software GL: the premiere's three.js canvas must render without a GPU.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    { name: 'desktop-chromium', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile-chromium',
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
