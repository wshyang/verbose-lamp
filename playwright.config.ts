import { defineConfig, devices } from '@playwright/test';

/**
 * The likeness gate (ADDENDUM-022 §0.5). Screenshots are the visual contract for
 * the renderer: they are committed, and re-baselining needs an addendum.
 *
 * Written in this sandbox and **not run** — there is no browser here and the
 * Playwright browser download host is unreachable. The user runs
 * `npx playwright install chromium && npm run e2e:update` once to capture the
 * baselines, then `npm run e2e` to compare. Comparisons are only valid on the same
 * OS, browser and version, which is why the snapshot names are OS-suffixed.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    // The screenshot budget lives in `likeness.spec.ts`, which configures its own
    // expect: a stable frame needs two captures, and on a software renderer one
    // capture of this scene takes ~30 s (ADDENDUM-043). Raising it globally would
    // make every failing web assertion wait two minutes.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2, animations: 'disabled' },
  },
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      // Software rasterisation: the gate has to render on a machine with no GPU.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
      // Set only by `scripts/sandbox-browser.mjs`, where the browser comes from an
      // npm tarball instead of Playwright's download host (ADDENDUM-043). Undefined
      // everywhere else, which is Playwright's normal behaviour.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        // Chromium engine on purpose: `hasCoarsePointer` then takes the mobile
        // auto-level framing path, which is what we want to photograph.
      },
    },
  ],
});
