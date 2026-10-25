import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Browser binaries normally come from `npx playwright install`. In a sandbox with no route
 * to the Playwright CDN, an air-gapped mirror, or a serverless Chromium such as
 * `@sparticuz/chromium`, point these at the binary instead (ADDENDUM-027 §8). Both are
 * unset in normal use, so the managed browser is still the default.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const externalArgs = (process.env.PLAYWRIGHT_CHROMIUM_ARGS ?? '').split(/\s+/).filter(Boolean);

/**
 * Browser gate for the premiere (ADDENDUM-022 §0.5).
 *
 * The likeness suite renders WebGL, so it runs on SwiftShader rather than a real GPU:
 * deterministic, and available on CI. Baselines are committed per project and are only
 * comparable on the same OS, browser and version — see §0.6 of the addendum.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // The scene renders on SwiftShader, which is roughly 6 fps at 1440x900: a load alone can
  // take 15 s, so the default 30 s ceiling is too tight even on fast hardware without a GPU.
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: {
    timeout: 20_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath,
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        ...externalArgs,
      ],
    },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
