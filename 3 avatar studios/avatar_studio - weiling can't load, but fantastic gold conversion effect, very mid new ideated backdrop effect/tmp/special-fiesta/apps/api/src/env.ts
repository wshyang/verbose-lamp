import { DEFAULT_VENUE_ID, PIN_PATTERN, VenueIdSchema } from '@psd/contracts';
import { z } from 'zod';
import { diagnoseConnectionString } from './db/connectionString.js';

/**
 * The only place this app reads process.env (AGENTS-workflow.md §2).
 * Parsed once, validated, and frozen into a typed object.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  /**
   * ADR-051 — usually unset. Leave it alone and the driver follows `DATABASE_URL`: a connection
   * string means a real server, its absence means embedded PGlite. Set it only to override that
   * inference — which the test harness does, so a `DATABASE_URL` sitting in a developer's `.env`
   * can never silently point the suite at a real database.
   */
  DATABASE_DRIVER: z.enum(['pglite', 'postgres']).optional(),
  /**
   * A standard Postgres connection string, including a managed one:
   * `postgresql://user:pass@host/db?sslmode=require`. TLS parameters are handled by `pg` itself —
   * `sslmode=require` turns TLS on — so the string is passed through unaltered and unknown
   * parameters a provider adds (Neon's `channel_binding`, for instance) are simply ignored.
   */
  DATABASE_URL: z.string().optional(),
  PGLITE_DATA_DIR: z.string().default('.data/dev'),
  /**
   * ADR-324 — the connection pool's limits. `pg`'s own defaults are "wait forever": no connect
   * timeout, no statement timeout, no idle-in-transaction timeout, so one stalled database parks
   * all ten connections and every request queues behind them. Postgres semantics for the two
   * server-side ones: 0 means none.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
  DATABASE_IDLE_TX_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(60_000),
  /** ADR-324 — open event streams across the process; past it a new one is refused with a 429 and the client backs off. */
  SSE_MAX_STREAMS: z.coerce.number().int().positive().default(2_000),
  /** ADR-324 — the gallery's total stored bytes (photos live in the database); past it an upload is refused with a 507. */
  GALLERY_MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(8_000_000_000),
  /**
   * ADR-051 — a test-harness toggle, declared here because this file is the only place allowed to
   * read `process.env` and that rule is worth keeping rather than carving an exception into.
   *
   * When set, `tests/postgres-driver.test.ts` runs against that server instead of skipping. It has
   * no effect on the running app: nothing outside that test reads it.
   */
  PSD_TEST_DATABASE_URL: z.string().optional(),
  /*
   * ADR-048 removed GALLERY_DATA_DIR. Photo bytes are rows in Postgres now, so they persist
   * wherever the database does: the PGlite data directory above, or an external server via
   * DATABASE_URL. There is no second storage location to configure, back up, or forget.
   */
  /**
   * ADR-324 — checked here against the same pattern the table's CHECK uses. A five-digit value used
   * to pass this schema and die inside the seed on every boot, which on a platform that restarts
   * the container is a crash loop with nothing in the log but a constraint name.
   */
  SUPERADMIN_INITIAL_PASSCODE: z.string().regex(PIN_PATTERN, 'must be exactly four digits').optional(),
  /**
   * Absolute path to a built web bundle (apps/web/dist). When set, the API serves it as the
   * SPA behind the same origin as /api — the shape a single container behind a tunnel needs.
   * Unset in development, where Vite owns the browser origin and proxies /api here.
   */
  WEB_DIST: z.string().optional(),
  SUPERADMIN_INITIAL_USERNAME: z.string().min(4, 'must be 4 to 20 characters').max(20, 'must be 4 to 20 characters').default('superadmin'),
  /**
   * ADR-118 — is there something out there that will start us again?
   *
   * The restart button ends the process, which is only a restart if a supervisor is watching.
   * In the container supervisord is PID 1 with `autorestart=true` (ADR-043) and sets this to
   * true; under `npm run dev` nothing is watching, so exiting would leave the developer with a
   * dead API and no clue why. Defaulting to false means the dangerous case has to be opted
   * into by the thing that can actually honour it, rather than assumed.
   */
  PROCESS_SUPERVISED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * ADR-102 — which data tier a fresh database gets beyond the default seed.
   * `default` (the usual): schema + `seed-default.sql` only. `demo`: additionally applies
   * `seed-demo.sql` — the recorded demo day — once, into a database with no participants.
   */
  PSD_SEED: z.enum(['default', 'demo']).default('default'),
  /**
   * ADR-295 — the venue this deployment is running at: which theme (palette, motifs, scene) the
   * participant app wears. Validated against the contracts' id list, so a typo fails at boot
   * rather than as a blank page on the day. Changing it needs a restart; the next page load of
   * every phone picks it up (`GET /api/venue`).
   */
  PSD_VENUE: VenueIdSchema.default(DEFAULT_VENUE_ID),
  /**
   * ADR-249 — provision the database named by `DATABASE_URL` before the server opens a port.
   * Unset (or empty, which is how a platform renders "no value") does nothing extra.
   * `schema`: schema.sql + the default seed. `demo`: that, then the recorded demo day, by calling
   * `db-provision.sh --demo`. Both are idempotent, and the demo day still only lands in a database
   * with no participants (ADR-102).
   */
  DB_INIT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['schema', 'demo']).optional(),
  ),
  /**
   * ADR-264 — `stale`: before DB_INIT runs, if the database's stamped schema version
   * (schema_state) is older than this build's, drop the snapshot's tables (via
   * db-reset.sh) and let DB_INIT rebuild onto the empty database. Inert without DB_INIT:
   * parsed here, warned about in the boot log, and read nowhere else. A database stamped
   * NEWER than this build refuses the boot rather than being reset backwards.
   */
  DB_INIT_RESET: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['stale']).optional(),
  ),
  /**
   * ADR-252 — a more privileged connection string used ONLY by the DB_INIT step. When present it
   * replaces DATABASE_URL for provisioning (schema, seed, demo day) and the runtime role in
   * DATABASE_URL is granted access to what was built; the running app still connects as
   * DATABASE_URL. Empty means unset. Ignored, with a warning, when DB_INIT is not set.
   */
  DATABASE_URL_ADMIN: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * `Lax` is right for a normal deployment. An app served inside someone else's page (a
   * preview iframe, an intranet portal) is a cross-site context: the browser will not store
   * or return a `Lax` cookie there, so the participant signs in and is immediately signed
   * out again. `None` + `Secure` + `Partitioned` is the combination that survives that.
   */
  COOKIE_SAMESITE: z.enum(['Lax', 'Strict', 'None']).default('Lax'),
  COOKIE_PARTITIONED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * Prints one line per credential-bearing request: which carriers arrived and what the
   * answer was, never the token itself. Off by default; the switch exists because the only
   * way to tell a stripped header from a rejected session is to look at what reached us.
   */
  LOG_AUTH_CARRIER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})
  .superRefine((value, ctx) => {
    // Both rules are browser rules, not ours: a cookie that breaks them is silently dropped,
    // which is the hardest possible failure to debug from the beach.
    if (value.COOKIE_SAMESITE === 'None' && !value.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SAMESITE=None requires COOKIE_SECURE=true.',
      });
    }
    if (value.COOKIE_PARTITIONED && !value.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_PARTITIONED=true requires COOKIE_SECURE=true.',
      });
    }
    for (const issue of databaseIssues(value)) ctx.addIssue({ code: 'custom', ...issue });
  });

export type AppEnv = z.infer<typeof envSchema>;

interface DatabaseSettings {
  DATABASE_URL?: string | undefined;
  DATABASE_URL_ADMIN?: string | undefined;
  DATABASE_DRIVER?: string | undefined;
  DB_INIT?: string | undefined;
  DB_INIT_RESET?: string | undefined;
}

interface EnvIssue {
  path: string[];
  message: string;
}

/**
 * ADR-251 — what is structurally wrong with a connection string, as a sentence that never contains
 * it. Empty means unset (bootLog warns about that separately).
 */
function urlIssue(name: string, url: string | undefined): EnvIssue[] {
  const problem = url ? diagnoseConnectionString(url) : null;
  return problem ? [{ path: [name], message: `the value ${problem}` }] : [];
}

/**
 * Every rule about the database settings, in one place so the schema's refinement stays readable.
 * Failing here is the point: a missing or malformed URL should stop the boot at startup, naming the
 * variable, rather than at the first query.
 */
function databaseIssues(value: DatabaseSettings): EnvIssue[] {
  const issues: EnvIssue[] = [];
  // The URL is only dialled when the server driver is in use; DATABASE_DRIVER=pglite ignores it.
  if (value.DATABASE_DRIVER !== 'pglite') issues.push(...urlIssue('DATABASE_URL', value.DATABASE_URL));
  if (value.DB_INIT) issues.push(...urlIssue('DATABASE_URL_ADMIN', value.DATABASE_URL_ADMIN));
  if (value.DB_INIT && !value.DATABASE_URL) {
    issues.push({
      path: ['DATABASE_URL'],
      message: 'DB_INIT requires DATABASE_URL: it provisions the database that names.',
    });
  }
  if (value.DATABASE_DRIVER === 'postgres' && !value.DATABASE_URL) {
    issues.push({ path: ['DATABASE_URL'], message: 'DATABASE_DRIVER=postgres requires DATABASE_URL.' });
  }
  return issues;
}

/**
 * Which driver to open (ADR-051).
 *
 * `DATABASE_URL` alone is enough: pointing the app at a Postgres server should not also require
 * remembering a second switch, and forgetting that switch would silently run an event against an
 * embedded database nobody else can see. An explicit `DATABASE_DRIVER` still wins, which is how the
 * test harness stays on PGlite regardless of what is in a developer's `.env`.
 */
export function resolveDriver(env: AppEnv): 'pglite' | 'postgres' {
  if (env.DATABASE_DRIVER) return env.DATABASE_DRIVER;
  return env.DATABASE_URL ? 'postgres' : 'pglite';
}

/**
 * ADR-251 — one `KEY: reason` line per problem. Zod's own message is a JSON dump whose quotes are
 * escaped, which is unreadable in a container log and, worse, hides which variable is wrong.
 * Only the reason is printed, never the value: an invalid DATABASE_URL is still a secret.
 */
function describeEnvIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  const lines = issues.map((issue) => `  ${issue.path.map(String).join('.')}: ${issue.message}`);
  return ['Invalid environment:', ...lines].join('\n');
}

/**
 * Validate an environment-shaped object, throwing the readable ADR-251 message on failure.
 * Exported so a test can prove a bad value stops boot without touching `process.env`.
 */
export function parseEnv(source: NodeJS.ProcessEnv): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) throw new Error(describeEnvIssues(parsed.error.issues));
  return Object.freeze(parsed.data);
}

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}

/**
 * The environment a child process inherits (ADR-249: `db-provision.sh`). Here because this file is
 * the only one allowed to touch `process.env`; the caller layers its own variables on top.
 */
export function inheritedEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

/** Tests build their own environment; production never calls this. */
export function overrideEnv(overrides: Partial<AppEnv>): AppEnv {
  cached = Object.freeze({ ...getEnv(), ...overrides });
  return cached;
}
