import type { PlaywrightTestConfig } from '@playwright/test';

/**
 * ADR-344 — the one home for what every Playwright config in this repository repeats.
 *
 * There are five configs (the default run, full-event, dress-rehearsal, tessensohn — and the
 * sibling branch's mode-switch), and until this module each re-declared the external-Chromium
 * stanza, the video policy, a port pair and a scratch-stack webServer by hand. The ADR-170
 * lesson (path arithmetic in one file, after a `git mv` broke three `dirname` joins "no
 * type-checker could see") applies to all of it: runtime-relevant strings, duplicated, that no
 * tool related to each other. This module is the one place they now meet — and the place the
 * standards rule `e2e-stack-coverage` reads, so an own-stack suite that forgets the default
 * run's ignore list fails `npm run standards` instead of silently running against the shared
 * stack (finding S4).
 */

/**
 * The suites that run on a stack of their own — a singleton mutation (full-event,
 * dress-rehearsal: the tournament is one row per database and activation cannot be undone
 * through any UI; scale: the day activates the tournament, and a wipe-on-start stack under
 * sustained load is nobody's shared dev database) or a process-wide venue (tessensohn:
 * `PSD_VENUE` belongs to the API process, not a browser session). The default config's
 * `testIgnore` is built from this
 * list, so `playwright test` with no arguments means "safe against the shared dev stack"
 * and keeps meaning it.
 *
 * `e2e-stack-coverage` checks this list against the root `playwright.<name>.config.ts`
 * files: a new own-stack config whose directory is missing here fails the gate.
 */
export const OWN_STACK_DIRS = ['full-event', 'dress-rehearsal', 'tessensohn', 'scale', 'load'] as const;

/**
 * The default run ignores every own-stack directory — see `OWN_STACK_DIRS` — and every e2e
 * unit test: those are vitest's to run (`npm run test:e2e:unit`, ADR-348 plan §8), and
 * Playwright loading a file that imports `vitest` kills the whole listing with "Vitest failed
 * to access its internal state". ADR-350 generalized the pattern to all of e2e: vitest owns
 * `*.test.ts`, Playwright owns `*.spec.ts` — one rule, stated once.
 */
export function ownStackIgnore(): string[] {
  return [...OWN_STACK_DIRS.map((dir) => `**/${dir}/**`), '**/*.test.ts'];
}

/**
 * The port registry. Each own-stack suite gets its own pair; a pair is never shared, because
 * two wipe-on-start stacks sharing ports cross-wire: the second webServer's health check
 * passes against the FIRST server, and its specs run against the wrong database and the wrong
 * venue. (dress-rehearsal and tessensohn shared 5175/8789 before this registry existed —
 * tessensohn has its own pair now, which is why the sibling branch's mode-switch cannot keep
 * the 5176/8790 its own tree uses: when it lands it takes the next free pair, 5177/8791.)
 * A new suite takes the next free pair, full stop.
 *
 * The shared dev stack is the `dev` defaults (5173/3000); the main config's webServer is
 * `npm run dev` with no overrides, so it is not in the registry.
 */
export const PORTS = {
  fullEvent: { web: 5174, api: 8788 },
  dressRehearsal: { web: 5175, api: 8789 },
  tessensohn: { web: 5176, api: 8790 },
  /*
   * ADR-348 — the scale run. 5177/8791 is spoken for by the sibling branch's mode-switch (see
   * the registry's comment above), so this suite takes the NEXT free pair after it.
   */
  scale: { web: 5178, api: 8792 },
  /*
   * ADR-350 — the load tier. The standalone CLI launches its scratch API on the pair's API
   * slot; the cast spec's stack runs both, so the two can never cross-wire on the web port.
   */
  load: { web: 5179, api: 8793 },
} as const;

/**
 * A sandbox that cannot reach the Playwright browser CDN points `PSD_E2E_CHROMIUM` at any
 * Chromium executable — the recipe is recorded in
 * `docs/proposals/2026-10-23-greenfield-enhancements-from-the-adrs.md` (P16): the
 * `@sparticuz/chromium` binary, NSPR+NSS built from source with `gyp-next`/`ninja` from PyPI,
 * and `LD_LIBRARY_PATH`. The flags below are the container-survival set; they ride along only
 * when an external binary is named, exactly as before.
 */
const CONTAINER_FLAGS = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] as const;

const externalChromium = process.env['PSD_E2E_CHROMIUM'];

/**
 * The launch options every Chromium project shares. `extraArgs` (the camera flags, ADR-042)
 * ride along on either path; an empty result means "let Playwright use its own browser with
 * no overrides", so the WebKit projects of the default run never see a Chromium flag
 * (ADR-044).
 */
export function chromiumLaunch(extraArgs: readonly string[] = []) {
  if (externalChromium !== undefined) {
    return { executablePath: externalChromium, args: [...extraArgs, ...CONTAINER_FLAGS] };
  }
  return extraArgs.length > 0 ? { args: [...extraArgs] } : {};
}

/** Video is ON by default — a suite that is blind on failure is worse than no suite. `PSD_E2E_VIDEO=off` is the one off-switch. */
export function videoPolicy(): 'on' | 'off' {
  return process.env['PSD_E2E_VIDEO'] === 'off' ? 'off' : 'on';
}

/** The failure evidence every own-stack config asks for, kept identical so reports compare. */
export const FAILURE_EVIDENCE = {
  video: videoPolicy(),
  trace: 'retain-on-failure' as const,
  screenshot: 'only-on-failure' as const,
};

/**
 * The webServer of an own-stack suite: its own PGlite directory, wiped as part of the command
 * (so there is no way to run against yesterday's leftovers by forgetting an argument —
 * `rm -rf` is safe precisely because the path is a constant the caller owns and is NOT the
 * dev database), never reusing a surviving server (it was started with some other state),
 * and seeding defaults only. `env` carries what makes the stack special (tessensohn's
 * `PSD_VENUE`).
 */
export function scratchWebServer(stack: {
  webPort: number;
  apiPort: number;
  /** Relative to the API's cwd (apps/api), which is where PGLITE_DATA_DIR is resolved. */
  dataDir: string;
  env?: Record<string, string>;
}): NonNullable<PlaywrightTestConfig['webServer']> {
  return {
    command: `rm -rf apps/api/${stack.dataDir} && npm run dev`,
    // Vite proxies /api to the scratch API, so the browser only ever uses relative URLs.
    url: `http://127.0.0.1:${stack.webPort}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(stack.apiPort),
      PSD_WEB_PORT: String(stack.webPort),
      PSD_API_TARGET: `http://127.0.0.1:${stack.apiPort}`,
      PGLITE_DATA_DIR: stack.dataDir,
      // A fresh database seeds the defaults only; the spec builds everything else it needs.
      PSD_SEED: 'default',
      ...stack.env,
    },
  };
}
