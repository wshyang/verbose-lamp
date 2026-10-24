import { defineConfig } from "@playwright/test";

// CLAUDE §3: video on by default; PW_VIDEO=off disables. E2E drives the real
// built app (npm run build first; CI does) with no mocks.
const video = process.env.PW_VIDEO === "off" ? "off" : "on";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    video,
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npm run serve:dist",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
});
