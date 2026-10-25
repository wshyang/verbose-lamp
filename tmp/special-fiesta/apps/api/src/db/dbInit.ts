import { spawn } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inheritedEnv, type AppEnv } from '../env.js';
import { bootStep } from './bootLog.js';
import {
  CURRENT_SCHEMA_VERSION,
  ensureSchema,
  readSchemaVersion,
  schemaStatus,
  type SchemaOutcome,
} from './bootstrap.js';
import { openDatabaseAt, type DatabaseHandle } from './client.js';
import { waitForDatabase } from './connectivity.js';
import { describeAccess, grantRuntimeAccess, roleNameFrom, verifyRuntimeAccess } from './provision.js';
import { seedDatabase } from './seed.js';

/**
 * ADR-249 — `DB_INIT`: provision the database `DATABASE_URL` names, as an explicit step of boot.
 *
 *   schema  schema.sql + the default seed, in this process. This is what every boot already does
 *           (ADR-049); naming it makes it a stated, logged step instead of an implicit one.
 *   demo    everything `schema` does, then the recorded demo day — by calling `db-provision.sh
 *           --demo`, the script an operator runs by hand, so the app and the operator cannot
 *           provision differently (ADR-178). The "only into a database with no participants" guard
 *           lives in `applyDemoSeed`, which that script calls, so a restart cannot double the crowd.
 *
 * ADR-252 — `DATABASE_URL_ADMIN`. When set, provisioning runs as THAT role and the role in
 * `DATABASE_URL` is granted what was built and checked for it, so the running app can hold the
 * least privilege that still works (read/write on tables) while a separate, more powerful
 * credential — present only for the init — does the DDL. The two may be the same role, in which
 * case there is nothing to grant. The admin URL overrides DATABASE_URL for provisioning ONLY.
 *
 * ADR-250 — several instances may run this at once. `schema` takes the provisioning lock here.
 * `demo` does NOT hold it across the spawn: the script takes the same lock on its own connection,
 * so holding it here would deadlock the parent against its own child. The child serialises itself.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PROVISION_SCRIPT = join(HERE, '..', '..', '..', '..', 'db-provision.sh');
const RESET_SCRIPT = join(HERE, '..', '..', '..', '..', 'db-reset.sh');
const DEMO_TIMEOUT_MS = 10 * 60 * 1000;

export type DbInitMode = NonNullable<AppEnv['DB_INIT']>;

/** What the script is asked to do, kept apart from how it is run so a test can see both. */
export interface ProvisionScriptCall {
  script: string;
  args: readonly string[];
  /** Written to the script's stdin: a connection string on argv is visible in the process list. */
  stdin: string;
  env: NodeJS.ProcessEnv;
}

export type ScriptRunner = (call: ProvisionScriptCall) => Promise<void>;

export const runProvisionScript: ScriptRunner = (call) =>
  new Promise((resolve, reject) => {
    const child = spawn('bash', [call.script, ...call.args], {
      env: call.env,
      stdio: ['pipe', 'inherit', 'inherit'],
      timeout: DEMO_TIMEOUT_MS,
    });
    child.once('error', reject);
    // ADR-324 — a script that exits before reading its stdin makes the write below raise EPIPE on
    // this stream. With no listener that is an uncaught exception; the 'close' handler already
    // reports the exit code, so this only has to keep the stream's error from escaping.
    child.stdin.on('error', () => undefined);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else {
        const how = signal ? `was killed by ${signal} (timeout is ${DEMO_TIMEOUT_MS / 60000} min)` : `exited ${code}`;
        // ADR-315 — the runner serves both boot scripts; name the one that failed. When
        // db-reset.sh was missing from the image, this message blamed db-provision.sh
        // and sent the reader to the wrong file.
        reject(new Error(`${basename(call.script)} ${how}. Its own output is in the lines directly above.`));
      }
    });
    child.stdin.end(`${call.stdin}\n`);
  });

/** The URL provisioning runs as: the admin credential when one is given, else the app's own. */
export function provisioningUrl(env: AppEnv): string | undefined {
  return env.DATABASE_URL_ADMIN ?? env.DATABASE_URL;
}

/** Who gets granted access to what the admin builds: the role the running app connects as. */
function runtimeRoleOf(env: AppEnv): string | null {
  if (!env.DATABASE_URL_ADMIN || !env.DATABASE_URL) return null;
  const runtime = roleNameFrom(env.DATABASE_URL);
  return runtime === roleNameFrom(env.DATABASE_URL_ADMIN) ? null : runtime;
}

/**
 * The script's environment: ours, minus what configures the APP's boot. The script names its target
 * on stdin; leaving these in would make it re-read them (and fail env validation without
 * DATABASE_URL), or worse, act on the wrong database.
 */
function childEnv(): NodeJS.ProcessEnv {
  const {
    DB_INIT: _init,
    DB_INIT_RESET: _reset,
    DATABASE_URL_ADMIN: _admin,
    DATABASE_URL: _url,
    DATABASE_DRIVER: _driver,
    ...rest
  } = inheritedEnv();
  return rest;
}

function demoCall(env: AppEnv, url: string): ProvisionScriptCall {
  if (!env.SUPERADMIN_INITIAL_PASSCODE) {
    // The script would otherwise stop to ask on a terminal that does not exist.
    throw new Error('DB_INIT=demo requires SUPERADMIN_INITIAL_PASSCODE (the default seed creates the superadmin).');
  }
  const runtimeRole = runtimeRoleOf(env);
  return {
    script: PROVISION_SCRIPT,
    // --no-install: the image's dependencies are already installed and pruned; `npm ci` is wrong there.
    // --grant-to takes a role NAME, which is not a secret, so it may sit on argv.
    args: ['--demo', '--no-install', ...(runtimeRole ? ['--grant-to', runtimeRole] : [])],
    stdin: url,
    env: { ...childEnv(), SUPERADMIN_INITIAL_PASSCODE: env.SUPERADMIN_INITIAL_PASSCODE },
  };
}

function resetCall(url: string): ProvisionScriptCall {
  return {
    script: RESET_SCRIPT,
    // --no-install, as for the demo call: the image's dependencies are already installed.
    args: ['--no-install'],
    stdin: url,
    env: childEnv(),
  };
}

/**
 * ADR-264 — the stale check, run before DB_INIT's own action when DB_INIT_RESET=stale.
 *
 * Reads the stamp as the provisioning role (the admin when one is given, since the app
 * role may hold no privileges over a schema_state it has never been granted). Three
 * answers: current or empty — nothing to do; older with tables standing — reset through
 * db-reset.sh, exactly as an operator would, then let DB_INIT rebuild; newer — refuse,
 * because resetting a database built by a newer build destroys what this build cannot
 * recreate. The script takes the provisioning lock itself, as the demo child does.
 */
interface MaybeResetDeps {
  env: AppEnv;
  handle: DatabaseHandle;
  runner: ScriptRunner;
  openAdmin: NonNullable<DbInitDeps['openAdmin']>;
}

async function maybeResetStale({ env, handle, runner, openAdmin }: MaybeResetDeps): Promise<string[]> {
  if (env.DB_INIT_RESET !== 'stale') return [];
  let probe = handle;
  let admin: DatabaseHandle | null = null;
  if (env.DATABASE_URL_ADMIN) {
    admin = await bootStep('DB_INIT_RESET: connecting as the admin role', () =>
      openAdmin(env.DATABASE_URL_ADMIN ?? ''),
    );
    probe = admin;
  }
  try {
    const version = await readSchemaVersion(probe);
    if (version > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `DB_INIT_RESET=stale: this database is stamped schema version ${version}, NEWER than ` +
          `this build's ${CURRENT_SCHEMA_VERSION}. Refusing to reset it backwards — deploy the ` +
          'newer build, or reset the database by hand if you truly mean to go back.',
      );
    }
    const status = await schemaStatus(probe);
    const present = status.expected - status.missing.length;
    if (version >= CURRENT_SCHEMA_VERSION || present === 0) return [];
    console.log(
      `[db] DB_INIT_RESET=stale: schema version ${version} predates this build's ` +
        `${CURRENT_SCHEMA_VERSION}: running db-reset.sh (its output follows)`,
    );
    await runner(resetCall(provisioningUrl(env) ?? ''));
    return [
      `DB_INIT_RESET=stale: reset a schema stamped version ${version}; DB_INIT rebuilt it at ${CURRENT_SCHEMA_VERSION}`,
    ];
  } finally {
    if (admin) await admin.close();
  }
}

async function initSchema(handle: DatabaseHandle): Promise<SchemaOutcome> {
  return handle.withProvisionLock(async () => {
    const outcome = await ensureSchema(handle);
    await seedDatabase(handle);
    return outcome;
  });
}

/**
 * ADR-252 — tables belong to whoever builds them, so what the admin built is unreadable to the
 * app's role until it is granted, and a failure there looks like `permission denied for table …`
 * at the first request, long after boot said everything was fine. Granted and VERIFIED here.
 */
async function grantAndVerify(admin: DatabaseHandle, role: string): Promise<string> {
  await grantRuntimeAccess(admin, role);
  const report = await verifyRuntimeAccess(admin, role);
  if (!report.exists || !report.canUseSchema || report.unreachable.length > 0) {
    throw new Error(`granting to ${role} did not take effect. ${describeAccess(report)}`);
  }
  return `${role} can read and write all ${report.tablesTotal} tables`;
}

export interface DbInitDeps {
  runner?: ScriptRunner;
  openAdmin?: (url: string) => Promise<DatabaseHandle>;
}

export async function openAdminDatabase(url: string): Promise<DatabaseHandle> {
  await waitForDatabase(url);
  return openDatabaseAt(url);
}

async function initSchemaAsAdmin(env: AppEnv, openAdmin: NonNullable<DbInitDeps['openAdmin']>): Promise<string[]> {
  const admin = await bootStep('DB_INIT: connecting as the admin role', () => openAdmin(env.DATABASE_URL_ADMIN ?? ''));
  try {
    const outcome = await bootStep('DB_INIT: schema and default seed (admin)', () => initSchema(admin));
    const lines = [`DB_INIT=schema: schema ${outcome}, default seed applied (as the admin role)`];
    const role = runtimeRoleOf(env);
    if (role) lines.push(`DB_INIT: ${await bootStep(`DB_INIT: granting to ${role}`, () => grantAndVerify(admin, role))}`);
    return lines;
  } finally {
    await admin.close();
  }
}

/** Runs the requested mode and returns the lines worth logging. A failure throws: boot must stop. */
export async function runDbInit(
  handle: DatabaseHandle,
  env: AppEnv,
  deps: DbInitDeps = {},
): Promise<string[]> {
  const { runner = runProvisionScript, openAdmin = openAdminDatabase } = deps;
  if (!env.DB_INIT) return [];
  const url = provisioningUrl(env);
  if (!url) throw new Error('DB_INIT requires DATABASE_URL.');
  // A demo refusal (no passcode) must land BEFORE a destructive reset, not after it.
  if (env.DB_INIT === 'demo' && !env.SUPERADMIN_INITIAL_PASSCODE) {
    throw new Error('DB_INIT=demo requires SUPERADMIN_INITIAL_PASSCODE (the default seed creates the superadmin).');
  }
  const resetLines = await maybeResetStale({ env, handle, runner, openAdmin });
  if (env.DB_INIT === 'schema') {
    if (env.DATABASE_URL_ADMIN) return [...resetLines, ...(await initSchemaAsAdmin(env, openAdmin))];
    return [...resetLines, `DB_INIT=schema: schema ${await initSchema(handle)}, default seed applied`];
  }
  const who = env.DATABASE_URL_ADMIN ? 'as the admin role (DATABASE_URL_ADMIN)' : 'as the app role';
  console.log(`[db] DB_INIT=demo: running db-provision.sh --demo ${who} (its output follows)`);
  await runner(demoCall(env, url));
  return [...resetLines, 'DB_INIT=demo: db-provision.sh --demo finished (demo day applied only if no participants)'];
}
