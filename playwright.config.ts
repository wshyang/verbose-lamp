import { defineConfig } from '@playwright/test';

/**
 * Likeness gate (ADDENDUM-022 §0.5). Screenshot baselines are committed and
 * only comparable on the same OS/browser. Capture them with
 * `npx playwright install chromium && npm run e2e:update`.
 * Video records by default (greenfield §3); PW_VIDEO=off disables it.
 */
export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2, animations: 'disabled' },
  },
  use: {
    video: process.env.PW_VIDEO === 'off' ? 'off' : 'on',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    { name: 'desktop-chromium', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile-chromium',
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
});
