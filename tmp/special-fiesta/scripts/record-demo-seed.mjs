#!/usr/bin/env node
/**
 * ADR-040 — re-record the demo seed: `npm run demo:record`.
 *
 * The demo participants in `scripts/demo-participants.dump.json` are not written by
 * hand — they are what a real server holds after every persona in
 * `scripts/demo-personas.json` walks the real sign-up screen and the real photo
 * studio in Chromium. This script owns that recording session:
 *
 *   1. wipe a dedicated data directory (never `.data/dev` — your dev data is safe);
 *   2. start the full stack against it;
 *   3. run `e2e/acceptance/demo-onboarding.spec.ts` (gated by PSD_E2E_ONBOARDING);
 *   4. stop the stack and leave the fresh dump behind for `seed-demo.mjs` to replay.
 *
 * Chromium comes from the usual e2e knobs: set PSD_E2E_CHROMIUM (and LD_LIBRARY_PATH
 * when the binary needs it) exactly as for `npm run test:e2e`.
 *
 * On a host with internet access, `PSD_E2E_REAL_MODEL=1 npm run demo:record` records
 * with the genuine Transformers.js + MODNET pipeline instead of the stand-ins — the
 * seed sprites then carry real silhouettes. Expect the first photo to take a while
 * (the model weights download once) and the whole recording to run longer.
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, '.data', 'demo-recording');
const HEALTH = 'http://127.0.0.1:5173/api/health';

function fail(message) {
  console.error(`[demo:record] ${message}`);
  process.exit(1);
}

async function serverIsUp() {
  try {
    const response = await fetch(HEALTH);
    return response.ok;
  } catch {
    return false;
  }
}

// A stack already listening would be someone's lived-in data — refuse, never wipe it.
if (await serverIsUp()) {
  fail('a dev stack is already running on :5173 — stop it first, this recording needs its own empty server');
}

rmSync(DATA_DIR, { recursive: true, force: true });

const stack = spawn('node', ['scripts/dev.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PGLITE_DATA_DIR: DATA_DIR },
  stdio: 'inherit',
  detached: true,
});

const stopStack = () => {
  try {
    process.kill(-stack.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stopStack);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

const deadline = Date.now() + 120_000;
while (!(await serverIsUp())) {
  if (Date.now() > deadline) fail('the stack never became healthy on :5173');
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

console.log('[demo:record] stack is up on a wiped database — recording begins');

const run = spawn(
  'npx',
  ['playwright', 'test', 'e2e/acceptance/demo-onboarding.spec.ts', '--project=desktop-chrome'],
  {
    cwd: ROOT,
    env: { ...process.env, PSD_E2E_ONBOARDING: '1', PSD_E2E_VIDEO: 'off' },
    stdio: 'inherit',
  },
);

const code = await new Promise((resolve) => run.on('exit', resolve));
stopStack();
if (code === 0) {
  console.log('[demo:record] done — scripts/demo-participants.dump.json is the new seed material');
}
process.exit(code ?? 1);
