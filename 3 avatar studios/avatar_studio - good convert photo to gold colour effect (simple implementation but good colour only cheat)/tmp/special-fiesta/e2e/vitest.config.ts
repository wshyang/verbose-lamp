import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * ADR-348, plan §8 — the e2e suite's own unit tests.
 *
 * The scale orchestrator's pure logic — the `vm_stat` parser and the admission controller — is
 * testable without a browser, and this is the config that runs those tests. The browser specs
 * themselves stay with Playwright; nothing here launches anything.
 *
 *   npm run test:e2e:unit
 *
 * The root is pinned to the repository root so the include pattern means the same thing no
 * matter which directory the command was invoked from. ADR-350 widened the include to
 * `e2e/load/**` — the protocol tier's pure engine is unit-tested the same way.
 */
export default defineConfig({
  test: {
    environment: 'node',
    root: fileURLToPath(new URL('../', import.meta.url)),
    include: ['e2e/support/crowd/**/*.test.ts', 'e2e/load/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
