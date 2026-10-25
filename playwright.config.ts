import { defineConfig } from '@playwright/test';

/**
 * Likeness gate (ADDENDUM-022 §0.5). Screenshot baselines are committed and
 * only comparable on the same OS/browser. Capture them with
 * `npx playwright install chromium && npm run e2e:update`.
 * Video records by default (greenfield §3); PW_VIDEO=off disables it.
 *
 * Sandbox/agent environments where the Playwright CDN is unreachable can
 * point at a Chromium binary extracted from the @sparticuz/chromium npm
 * tarball instead (ADDENDUM-030): PW_CHROMIUM_PATH is the executable and
 * PW_CHROMIUM_LIB the LD_LIBRARY_PATH for its bundled libraries.
 * Run `node e2e/support/setupSandboxChromium.mjs` to extract both.
 */
const chromiumPath = process.env.PW_CHROMIUM_PATH;
const chromiumLib = process.env.PW_CHROMIUM_LIB;
export default defineConfig({
  testDir: 'e2e',
  // Software (SwiftShader) WebGL takes tens of seconds to compile shaders and
  // render the first frozen frame on CPU-only machines; the gate's timeouts
  // must cover that rather than the 30 s defaults (ADDENDUM-030).
  timeout: 180_000,
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
  expect: {
    timeout: 30_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2, animations: 'disabled' },
  },
  use: {
    baseURL: 'http://localhost:4173',
    video: process.env.PW_VIDEO === 'off' ? 'off' : 'on',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
      ...(chromiumLib ? { env: { ...process.env, LD_LIBRARY_PATH: chromiumLib } } : {}),
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
