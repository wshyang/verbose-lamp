import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { listCutoutCorpus } from './tools/cutoutCorpus.js';

/**
 * `/corpus/*` in the dev server only: the photographs the cut-out report walks, named by
 * `listCutoutCorpus` (tools/cutoutCorpus.ts). That is the top level of `images/ingest/` alone, so
 * it reaches twenty of the 120 photographs in the demo persona list; see defect C1 in cutoutCorpus.test.ts.
 *
 * `cutout-report.html` (ADR-212's step 2) needs them in a browser, because the matte comes from
 * MODNET and the decode needs a canvas. They are not copied into `public/` because they are not
 * part of the app — they are a fixture, and duplicating ~20 photographs into the shipped bundle
 * to run a one-off report would be a poor trade. `apply: 'serve'` keeps all of this out of the
 * production build, which takes `index.html` alone and never sees this page.
 */
function corpusRoutes(): Plugin {
  const root = fileURLToPath(new URL('../../images/ingest/', import.meta.url));
  const listed = (): string[] => listCutoutCorpus(root);
  /**
   * The sixty adversarial photographs `listCutoutCorpus` deliberately does not reach (defect
   * C1). Served under their own `social/*` paths rather than folded into `listed()`, so this
   * stays additive: the protocol-pinned 26-photo corpus and `cutoutCorpus.test.ts`'s C1
   * expected failure are untouched. Only `cutout-full-report.html` asks for these.
   */
  const socialRoot = join(root, 'social');
  const listedSocial = (): string[] =>
    readdirSync(socialRoot)
      .filter((name) => name.endsWith('.png'))
      .sort();
  return {
    name: 'psd-cutout-corpus',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/corpus', ((request, response, next) => {
        const asked = (request.url ?? '/').replace(/^\//, '').split('?')[0] ?? '';
        if (asked === 'index.json') {
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(listed()));
          return;
        }
        if (asked === 'social/index.json') {
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(listedSocial()));
          return;
        }
        if (asked.startsWith('social/')) {
          const name = asked.slice('social/'.length);
          if (!listedSocial().includes(name)) {
            next();
            return;
          }
          response.setHeader('content-type', 'image/png');
          response.end(readFileSync(join(socialRoot, name)));
          return;
        }
        if (!listed().includes(asked)) {
          next();
          return;
        }
        response.setHeader('content-type', 'image/png');
        response.end(readFileSync(join(root, asked)));
      }) satisfies Connect.NextHandleFunction);
    },
  };
}

const API_TARGET = process.env['PSD_API_TARGET'] ?? 'http://127.0.0.1:8787';

/**
 * `_dev-common.sh` has always read `PSD_WEB_PORT` to decide where to health-check the web
 * server, but this file hardcoded 5173 — so asking for another port moved the check and not
 * the server. Honouring it here is what lets a second stack run alongside the first, which is
 * how the full-event e2e run gets a database of its own (ADR-174).
 */
const WEB_PORT = Number(process.env['PSD_WEB_PORT'] ?? 5173);

export default defineConfig({
  plugins: [react(), corpusRoutes()],
  server: {
    host: '0.0.0.0',
    port: WEB_PORT,
    // The dev server is reached through a proxied preview host, so the allowlist must not
    // reject it; browser code always calls relative /api paths that this proxy forwards.
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test-setup.ts',
        'src/test-utils/**',
        // Browser bootstrap: mounts the app into a real DOM document at startup.
        'src/main.tsx',
        /*
         * Type-only modules. These compile to an empty file, so v8 reports 0 % of 0 statements and the
         * run can never reach the threshold however many tests are written. `lib/avatar/types.ts`
         * (ADR-072) is the current one; any `interface`/`type`-only module belongs here.
         */
        'src/lib/avatar/types.ts',
        /*
         * ADR-147 — the service worker's event plumbing. It cannot be imported by a jsdom
         * test at all: there is no ServiceWorkerGlobalScope, no Cache API and no navigation.
         * Every judgement it makes is lifted into `src/sw/policy.ts`, which IS covered; what
         * is excluded here is the ~30 lines of listener wiring around it. The honest test for
         * this file is `e2e/service-worker.spec.ts`, which runs on a machine with a browser.
         */
        'src/sw/worker.ts',
      ],
      /*
       * A ratchet, not an aspiration (ADR-080).
       *
       * These sat at 100 while the test script ran plain `vitest run`, so the threshold was never
       * evaluated and the real figure drifted to 91 % unnoticed. The numbers below are today's actual
       * coverage: the gate now runs with `--coverage`, so it fails the moment coverage *falls*, and the
       * only way the floor moves is up — raise it in the same change that earns it.
       *
       * Set from the MINIMUM of several consecutive runs, never a single green reading: a floor
       * pinned to a lucky run fails the next build on an unchanged tree. Measured six times for
       * ADR-119 — and a run inside `npm run verify` reads LOWER than the same suite run alone
       * (functions 98.12 against 98.23), because a loaded machine changes what the timing-
       * sensitive surfaces execute. The floor is the lowest of all of them, not the pretty one.
       */
      // ADR-118's web half raised all four: three consecutive `npm run verify` runs read
      // 98.97 / 98.26 / 98.35 / 98.97 identically. Branches is pinned one tick below the
      // reading (98.34), because the raw count moved 3474↔3475 of 3532↔3533 between those
      // runs without the percentage changing — the margin is there so it cannot.
      /*
       * ADR-135 — corrected DOWN to the minimum, which is what the rule above says and what
       * this session's T5/T6 raises got wrong. They were pinned to a solo run's printed high
       * (99.01 / 98.65 / 98.43) and the very next `npm run verify` read 98.99 / 98.55 on an
       * unchanged tree: two statements and one function flicker between identical runs, and a
       * loaded machine is exactly when they flicker low. The numbers below are the minimum of
       * the runs observed, with branches left one tick under its reading for the same reason
       * the 98.34 note above gives. This is not a relaxation of the ADR-080 ratchet — the
       * ratchet is over what the suite reliably covers, and a floor that fails half the time
       * on an unchanged tree measures the machine, not the tests.
       */
      thresholds: { lines: 98.99, functions: 98.55, branches: 98.4, statements: 98.99 },
    },
  },
});
