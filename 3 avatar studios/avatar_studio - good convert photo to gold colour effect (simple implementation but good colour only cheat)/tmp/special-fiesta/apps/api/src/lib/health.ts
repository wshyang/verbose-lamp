import { monitorEventLoopDelay } from 'node:perf_hooks';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { unhandledRejectionCount } from './processGuards.js';

/**
 * ADR-324 — "can a real request succeed right now?"
 *
 * `/api/health` answers `{ok:true}` without touching anything, which is right for liveness (a
 * database blip must not get a healthy process killed) and useless for readiness: it said OK
 * while the pool was starved, the database was gone, or the event loop had been blocked for
 * seconds. This probe walks the path a real request takes and reports each stage separately:
 *
 *   listener  the server is accepting (and not draining for shutdown)
 *   app       the event loop is not stalled, measured rather than inferred
 *   db        a connection can be checked out and a READ ONLY transaction can run, inside a
 *             deadline — so a hung database is a fast 503 rather than a hung probe
 *
 * It is public and unauthenticated, so it must not be a way to hammer the database: concurrent
 * callers share one in-flight probe and the result is remembered for a second.
 */

export type CheckState = 'ok' | 'fail';
export interface HealthResult {
  ok: boolean;
  checks: { listener: CheckState; app: CheckState; db: CheckState };
  checkedAt: string;
  detail: { dbLatencyMs: number; loopDelayMs: number; unhandledRejections: number; dbError: string | null };
}

export interface HealthProbeOptions {
  checkDatabase: () => Promise<unknown>;
  isListening: () => boolean;
  isDraining: () => boolean;
  /** p99 event-loop delay over the last window, in milliseconds. */
  loopDelayMs: () => number;
  rejections: () => number;
  now: () => number;
  timeoutMs: number;
  maxLoopDelayMs: number;
}

export const HEALTH_MEMO_MS = 1_000;
export const HEALTH_DB_TIMEOUT_MS = 2_000;
export const HEALTH_MAX_LOOP_DELAY_MS = 1_000;

type DbOutcome = { state: CheckState; latencyMs: number; error: string | null };

async function timed(options: HealthProbeOptions): Promise<DbOutcome> {
  const started = options.now();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), options.timeoutMs);
  });
  try {
    const outcome = await Promise.race([options.checkDatabase().then(() => 'done' as const), deadline]);
    const latencyMs = options.now() - started;
    if (outcome === 'timeout') return { state: 'fail', latencyMs, error: `no answer in ${options.timeoutMs} ms` };
    return { state: 'ok', latencyMs, error: null };
  } catch (error) {
    return { state: 'fail', latencyMs: options.now() - started, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function measure(options: HealthProbeOptions): Promise<HealthResult> {
  const db = await timed(options);
  const loopDelayMs = options.loopDelayMs();
  const checks = {
    listener: options.isListening() && !options.isDraining() ? ('ok' as const) : ('fail' as const),
    app: loopDelayMs <= options.maxLoopDelayMs ? ('ok' as const) : ('fail' as const),
    db: db.state,
  };
  return {
    ok: Object.values(checks).every((state) => state === 'ok'),
    checks,
    checkedAt: new Date().toISOString(),
    detail: { dbLatencyMs: db.latencyMs, loopDelayMs, unhandledRejections: options.rejections(), dbError: db.error },
  };
}

export interface HealthProbe {
  run: () => Promise<HealthResult>;
}

/** Single-flight, and the answer is reused for `HEALTH_MEMO_MS` so the database is touched at most once a second. */
export function createHealthProbe(options: HealthProbeOptions): HealthProbe {
  let inFlight: Promise<HealthResult> | null = null;
  let last: { at: number; result: HealthResult } | null = null;
  const run = (): Promise<HealthResult> => {
    if (last !== null && options.now() - last.at < HEALTH_MEMO_MS && options.now() >= last.at) return Promise.resolve(last.result);
    if (inFlight !== null) return inFlight;
    inFlight = measure(options)
      .then((result) => {
        last = { at: options.now(), result };
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
  return { run };
}

// ── what the process owner supplies ────────────────────────────────────────────────────────

let listening: () => boolean = () => true;
let draining: () => boolean = () => false;

/** Called once by `index.ts`, which owns the server and the shutdown. Under `app.request()` the defaults hold. */
export function registerHealthSources(sources: { isListening: () => boolean; isDraining: () => boolean }): void {
  listening = sources.isListening;
  draining = sources.isDraining;
  startLoopWindow();
}

export function resetHealthSourcesForTests(): void {
  listening = () => true;
  draining = () => false;
}

const loop = monitorEventLoopDelay({ resolution: 20 });

/**
 * ADR-324 — the stall that counts is the one the *next* request would meet, not one that ended
 * before the app was listening. The histogram is started and cleared when the process owner
 * registers its sources (after the database is open and the port is bound), because loading a
 * WebAssembly Postgres blocks the loop for over a second at boot and that is not a reason to fail
 * a probe a minute later. After that the window restarts on every read: a stall that has ended
 * stops counting, and one that is still happening is seen by the sampler within its 20 ms tick.
 */
function startLoopWindow(): void {
  loop.reset();
  loop.enable();
}

function windowedLoopDelayMs(): number {
  const p99 = loop.percentile(99) / 1e6;
  loop.reset();
  return Number.isFinite(p99) ? p99 : 0;
}

/** The read-only transaction: the same checkout-and-transaction path a write takes, doing nothing a write would. */
async function readOnlyRoundTrip(db: AppDatabase): Promise<void> {
  await db.transaction(
    async (tx) => {
      await tx.execute(sql`select count(*) from superadmin_account`);
    },
    { accessMode: 'read only' },
  );
}

/** One probe per app instance, bound to its database. */
export function healthProbeFor(db: AppDatabase): HealthProbe {
  return createHealthProbe({
    checkDatabase: () => readOnlyRoundTrip(db),
    isListening: () => listening(),
    isDraining: () => draining(),
    loopDelayMs: windowedLoopDelayMs,
    rejections: unhandledRejectionCount,
    now: () => Date.now(),
    timeoutMs: HEALTH_DB_TIMEOUT_MS,
    maxLoopDelayMs: HEALTH_MAX_LOOP_DELAY_MS,
  });
}
