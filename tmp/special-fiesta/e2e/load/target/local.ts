import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR-350 — the local own-stack (the plan's §7): a scratch API the load CLI launches for
 * itself and tears down after, on the load tier's own port pair (`PORTS.load` — web 5179,
 * API 8793; the spec's stack runs both, the standalone launcher runs the API alone on the
 * pair's API slot, so the two can never cross-wire).
 *
 * PGlite is wiped on start: a load run is nobody's shared dev database. The web server is
 * deliberately not started — synthetic users speak HTTP to the API, and a Vite process
 * would be a spectator burning the very RAM the tier exists to save.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface LocalStack {
  readonly baseUrl: string;
  readonly apiPort: number;
  /** Relative to the API's cwd (apps/api), which is where PGLITE_DATA_DIR is resolved. */
  readonly dataDir: string;
  stop(): Promise<void>;
}

export interface LocalStackOptions {
  readonly apiPort: number;
  readonly dataDir: string;
  readonly superadminPasscode: string;
  /** ADR-324 — raised for ramp runs so the knee measures the server, not the cap (§12). */
  readonly streamCap: number;
}

export async function startLocalStack(options: LocalStackOptions): Promise<LocalStack> {
  const absoluteDataDir = join(REPO_ROOT, 'apps', 'api', options.dataDir);
  rmSync(absoluteDataDir, { recursive: true, force: true });

  /*
   * Spawned directly, not through `npm run`: npm does not forward signals, so a SIGTERM to
   * the wrapper left the real API process alive as an orphan — still holding the port and
   * the PGlite directory's lock, which hung the run's own read-back on the next open.
   * `node --import tsx` is the same runtime `npm run start` would have used.
   */
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: join(REPO_ROOT, 'apps', 'api'),
    env: {
      ...process.env,
      PORT: String(options.apiPort),
      PGLITE_DATA_DIR: options.dataDir,
      PSD_SEED: 'default',
      SUPERADMIN_INITIAL_PASSCODE: options.superadminPasscode,
      ...(options.streamCap === 2_000 ? {} : { SSE_MAX_STREAMS: String(options.streamCap) }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output: string[] = [];
  const note = (chunk: Buffer): void => {
    output.push(chunk.toString());
    if (output.length > 40) output.shift();
  };
  child.stdout?.on('data', note);
  child.stderr?.on('data', note);

  const baseUrl = `http://127.0.0.1:${options.apiPort}`;
  try {
    await waitForHealth(baseUrl, 120_000);
  } catch (error) {
    child.kill('SIGKILL');
    throw new Error(`the local stack never became healthy: ${String(error)}\nlast output:\n${output.join('')}`);
  }

  return {
    baseUrl,
    apiPort: options.apiPort,
    dataDir: options.dataDir,
    stop: async (): Promise<void> => {
      if (child.exitCode !== null) return;
      const exited = new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
      });
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 10_000);
      await exited;
      clearTimeout(force);
    },
  };
}

/**
 * Cast mode's door check: the stack the spec owns must already be answering. Shared with the
 * local launcher so both use one definition of "up".
 */
export async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`no 200 from ${baseUrl}/api/health within ${timeoutMs} ms`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.status === 200) return;
    } catch {
      // Not listening yet — the normal first seconds of a cold start.
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
}
