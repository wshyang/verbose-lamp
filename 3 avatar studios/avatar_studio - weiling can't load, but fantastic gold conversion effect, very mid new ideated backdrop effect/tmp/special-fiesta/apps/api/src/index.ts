import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { SESSION_COOKIE, SESSION_HEADER, SESSION_QUERY_PARAM } from './lib/session.js';
import { openDatabase, type DatabaseHandle } from './db/client.js';
import { bootStep, describeBootConfig, reportBootFailure } from './db/bootLog.js';
import { waitForDatabase } from './db/connectivity.js';
import { secretsFrom } from './db/connectionString.js';
import { ensureDemoData, ensureSchema } from './db/bootstrap.js';
import { runDbInit } from './db/dbInit.js';
import { describeIdentity, inspectDatabase } from './db/provision.js';
import { seedDatabase } from './db/seed.js';
import { getEnv, resolveDriver } from './env.js';
import { PRESENCE_FLUSH_MS, flushPresence } from './lib/presence.js';
import { withStaticWeb } from './webStatic.js';
import { onFatalDatabaseError } from './lib/fatalDatabase.js';
import { registerHealthSources } from './lib/health.js';
import { onShutdownRequest } from './lib/lifecycle.js';
import { startLifecycle, type Lifecycle } from './processLifecycle.js';
import { applyServerLimits } from './serverLimits.js';
import { UPSOON_WATCH_MS, publishUpSoonChanges } from './lib/upSoonWatch.js';
import { RECONCILE_TICK_MS, tickSchedule } from './routes-tournament/support.js';

/**
 * Which carriers a request actually arrived with (LOG_AUTH_CARRIER). Presence only — the
 * token is a live credential and never belongs in a log. Deployed behind someone else's
 * proxy, this is the difference between "the session expired" and "the header never made it".
 */
function logCarriers(request: Request, status: number): void {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return;
  const present = [
    (request.headers.get('cookie') ?? '').includes(`${SESSION_COOKIE}=`) ? 'cookie' : null,
    request.headers.get(SESSION_HEADER) ? 'header' : null,
    request.headers.get('authorization') ? 'authorization' : null,
    url.searchParams.get(SESSION_QUERY_PARAM) ? 'query' : null,
  ].filter((name) => name !== null);
  const carriers = present.length > 0 ? present.join('+') : 'none';
  console.log(`[auth] ${request.method} ${url.pathname} carriers=${carriers} -> ${status}`);
}

/** Long enough for the 202 to reach the browser, short enough that nobody presses twice. */
const RESTART_DELAY_MS = 250;

/**
 * ADR-118 — the restart button's other half, and only where something will start us again.
 *
 * Registering unconditionally was a footgun: under `npm run dev` nothing supervises this
 * process, so pressing restart exited the API and left the developer with a dead port and a
 * browser full of network errors. Not registering is what makes the route answer 503 and the
 * console render the button disabled, which is the truth — this deployment cannot restart
 * itself from here.
 *
 * The delay is not politeness: the handler runs inside the request that asked for it, and
 * stopping immediately would close the socket before the 202 reached the browser, so the
 * operator would see a network error and press it again. ADR-324 — it now stops through the
 * same graceful shutdown as SIGTERM (database closed, not killed), then exits 0: the platform
 * (supervisord in the demo image, the restart policy in the production one) starts us again
 * either way, and saying 0 keeps the log honest about this being a deliberate stop.
 */
function registerRestart(lifecycle: Lifecycle): void {
  onShutdownRequest((reason) => {
    console.log(`[api] restart requested by ${reason}; shutting down for the platform to restart`);
    setTimeout(() => void lifecycle.shutdown.run('restart', 0), RESTART_DELAY_MS).unref();
  });
}

/**
 * ADR-324 — a PGlite whose WebAssembly runtime has aborted answers every query with an error for
 * the rest of the process's life, and nothing used to notice. Where something will start us again
 * the answer is to leave (exit 1, so the platform logs it as a failure); where nothing will,
 * leaving would only strand the developer, so it is said loudly and left alone.
 */
function registerFatalDatabase(input: { lifecycle: Lifecycle; isSupervised: boolean }): void {
  onFatalDatabaseError(() => {
    console.error('[api] the database has failed and cannot recover in this process');
    if (input.isSupervised) void input.lifecycle.shutdown.run('fatal database error', 1);
  });
}

/** What must never reach a log if an error message happens to contain it. */
let secretsInPlay: string[] = [];

/** Connects to a real Postgres with retries before anything queries it (ADR-251). */
async function connectToDatabase(env: ReturnType<typeof getEnv>) {
  if (resolveDriver(env) === 'postgres' && env.DATABASE_URL) {
    await bootStep('reaching the database', () => waitForDatabase(env.DATABASE_URL ?? ''));
  }
  return bootStep('opening the connection pool', () => openDatabase());
}

/** The provisioning stages, one critical section across instances (ADR-250). */
async function provision(handle: DatabaseHandle, env: ReturnType<typeof getEnv>): Promise<void> {
  /*
   * ADR-178 — name the database and the role on every boot.
   *
   * On a managed platform `DATABASE_URL` is injected as a hidden variable, so the people running
   * the deployment cannot read which role the app connects as — and that role's name is the one
   * thing they need in order to grant it anything. The app can see it, so the app says it. No
   * credential is involved: this is `current_user`, asked of the database.
   */
  const identity = await bootStep('identifying the database role', () => inspectDatabase(handle));
  console.log(`[api] database: ${describeIdentity(identity)}`);
  // ADR-249 — DB_INIT runs first so everything below sees a database that is already provisioned.
  const initLines = await bootStep('DB_INIT', () => runDbInit(handle, env));
  for (const line of initLines) console.log(`[api] ${line}`);
  await bootStep('provisioning (waits if another instance is)', () =>
    handle.withProvisionLock(() => provisionSchemaAndSeed(handle)),
  );
}

async function provisionSchemaAndSeed(handle: DatabaseHandle): Promise<void> {
  const schemaOutcome = await bootStep('schema', () => ensureSchema(handle));
  if (schemaOutcome === 'provisioned') console.log('[api] empty database: applied schema.sql');
  /*
   * ADR-178 — a managed database whose role cannot run DDL. Worth a line rather than silence:
   * it tells the operator that this deployment is in the "somebody else provisions it" posture,
   * so a schema change needs `./db-provision.sh` and not merely a redeploy.
   */
  if (schemaOutcome === 'verified') {
    console.log('[api] schema verified (this role cannot alter the tables: provisioned by another role)');
  }
  if (schemaOutcome === 'repaired') {
    // Loud on purpose: this database was built by an older snapshot. The missing tables are now
    // there, but a column whose type changed in place is NOT — if anything looks wrong, the
    // remedy is a clean database (`./dev-reset.sh`), not another restart.
    console.warn('[api] database was missing part of schema.sql: applied it. Built by an older snapshot?');
  }
  await bootStep('default seed', () => seedDatabase(handle));
  const demoed = await bootStep('demo seed (PSD_SEED)', () => ensureDemoData(handle));
  if (demoed) console.log('[api] PSD_SEED=demo: applied seed-demo.sql');
}

/** The only file that opens a port. Provisions the schema and seeds on boot (ADR-049). */
async function main(): Promise<void> {
  const env = getEnv();
  secretsInPlay = [
    ...secretsFrom(env.DATABASE_URL ?? ''),
    ...secretsFrom(env.DATABASE_URL_ADMIN ?? ''),
    ...(env.SUPERADMIN_INITIAL_PASSCODE ? [env.SUPERADMIN_INITIAL_PASSCODE] : []),
  ];
  for (const line of describeBootConfig(env)) console.log(`[boot] ${line}`);
  const handle = await connectToDatabase(env);
  await provision(handle, env);
  const app = createApp(handle);
  const fetchHandler: typeof app.fetch = async (request, ...rest) => {
    const response = await app.fetch(request, ...rest);
    if (env.LOG_AUTH_CARRIER) logCarriers(request, response.status);
    return response;
  };
  const rootHandler = env.WEB_DIST ? withStaticWeb(fetchHandler, env.WEB_DIST) : fetchHandler;
  const server = serve({ fetch: rootHandler, port: env.PORT, hostname: '0.0.0.0' });
  // ADR-324 — EADDRINUSE / EACCES arrive here, asynchronously, so `main().catch` never sees them.
  server.on('error', failBoot);
  // ADR-324 — a client that trickles a request in must not hold its socket for Node's five minutes.
  applyServerLimits(server as unknown as Parameters<typeof applyServerLimits>[0]);
  // ADR-082 — the only file that opens a port is also the only file that starts background
  // clocks: requests note presence in memory, this interval writes it. `unref()` so the
  // timer never holds a stopping process open; `flushPresence` never rejects.
  setInterval(() => void flushPresence(handle.db), PRESENCE_FLUSH_MS).unref();
  /*
   * ADR-121/282 — the up-soon watcher, here for the same reason the presence flusher is: this is
   * the only file that owns the process, so it is the only file that starts a clock. It reads the
   * one cached day picture per tick and publishes only what moved.
   */
  setInterval(() => void publishUpSoonChanges(handle.db).catch(() => 0), UPSOON_WATCH_MS).unref();
  // ADR-282 — the scheduler re-plans as time passes, not only when somebody writes.
  setInterval(() => void tickSchedule(handle.db, new Date()), RECONCILE_TICK_MS).unref();
  const lifecycle = startLifecycle({
    server: server as unknown as Parameters<typeof startLifecycle>[0]['server'],
    db: handle.db,
    closeDatabase: () => handle.close(),
    exit: (code) => process.exit(code),
    log: (line) => console.log(line),
    signals: process,
    events: process,
  });
  // ADR-324 — readiness reports the listener and the shutdown, which only this file can see.
  registerHealthSources({ isListening: () => server.listening, isDraining: lifecycle.shutdown.isDraining });
  if (env.PROCESS_SUPERVISED) registerRestart(lifecycle);
  registerFatalDatabase({ lifecycle, isSupervised: env.PROCESS_SUPERVISED });
  console.log(`[api] listening on http://0.0.0.0:${env.PORT} (driver: ${resolveDriver(env)})`);
  if (env.WEB_DIST) console.log(`[api] serving web bundle from ${env.WEB_DIST}`);
}

/**
 * The report, not the exception: Drizzle's message is the failed SQL and the real reason is
 * several causes down. `describeFailure` finds it, says what to check, and redacts (ADR-251).
 */
function failBoot(error: unknown): void {
  for (const line of reportBootFailure(error, secretsInPlay)) console.error(`[api] ${line}`);
  process.exitCode = 1;
}

main().catch(failBoot);
