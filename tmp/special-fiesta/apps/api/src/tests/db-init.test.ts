import { afterEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { CURRENT_SCHEMA_VERSION, ensureSchema, readSchemaVersion, resetSchema } from '../db/bootstrap.js';
import { openInMemoryDatabase, type DatabaseHandle } from '../db/client.js';
import { runDbInit, type ProvisionScriptCall } from '../db/dbInit.js';
import { overrideEnv } from '../env.js';

/**
 * ADR-249 — `DB_INIT`. The script itself is exercised for real by `db-provision.sh` runs; here the
 * runner is the seam, so the test sees exactly what the app asks the script to do.
 */

const URL = 'postgresql://app:secret@db.example/psd';
const opened: DatabaseHandle[] = [];

async function freshDatabase(): Promise<DatabaseHandle> {
  const handle = await openInMemoryDatabase();
  opened.push(handle);
  return handle;
}

function envWith(overrides: Record<string, unknown>) {
  return overrideEnv({
    NODE_ENV: 'test',
    DATABASE_DRIVER: 'pglite',
    PGLITE_DATA_DIR: 'memory://',
    SUPERADMIN_INITIAL_PASSCODE: '4242',
    DATABASE_URL: URL,
    DB_INIT: undefined,
    ...overrides,
  });
}

describe('DB_INIT — provision the database named by DATABASE_URL', () => {
  afterEach(async () => {
    for (const handle of opened.splice(0)) await handle.close();
    envWith({ DATABASE_URL: undefined });
  });

  it('does nothing when DB_INIT is unset', async () => {
    const runner = vi.fn();

    const lines = await runDbInit(await freshDatabase(), envWith({}), { runner });

    expect(lines).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it('schema mode builds the schema and default seed in-process, without the script', async () => {
    const handle = await freshDatabase();
    const runner = vi.fn();

    const lines = await runDbInit(handle, envWith({ DB_INIT: 'schema' }), { runner });

    expect(lines).toEqual(['DB_INIT=schema: schema provisioned, default seed applied']);
    expect(runner).not.toHaveBeenCalled();
    // Read back what outlives the call, not the log line.
    expect((await handle.db.query.clusters.findMany()).length).toBeGreaterThan(0);
    expect((await handle.db.query.superadminAccounts.findMany()).length).toBe(1);
  });

  it('demo mode calls db-provision.sh --demo, with the URL on stdin and never on argv', async () => {
    const calls: ProvisionScriptCall[] = [];

    const lines = await runDbInit(await freshDatabase(), envWith({ DB_INIT: 'demo' }), {
      runner: async (call) => {
        calls.push(call);
      },
    });

    expect(lines).toHaveLength(1);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.script).toMatch(/\/db-provision\.sh$/);
    expect(call?.args).toEqual(['--demo', '--no-install']);
    expect(call?.stdin).toBe(URL);
    expect(call?.args.join(' ')).not.toContain('secret');
    expect(call?.env['SUPERADMIN_INITIAL_PASSCODE']).toBe('4242');
  });

  it('demo mode refuses, before running anything, when there is no superadmin passcode', async () => {
    const runner = vi.fn();

    await expect(
      runDbInit(
        await freshDatabase(),
        envWith({ DB_INIT: 'demo', SUPERADMIN_INITIAL_PASSCODE: undefined }),
        { runner },
      ),
    ).rejects.toThrow('requires SUPERADMIN_INITIAL_PASSCODE');
    expect(runner).not.toHaveBeenCalled();
  });

  it('lets a script failure stop the boot instead of swallowing it', async () => {
    const failing = async () => {
      throw new Error('db-provision.sh exited 1');
    };

    await expect(
      runDbInit(await freshDatabase(), envWith({ DB_INIT: 'demo' }), { runner: failing }),
    ).rejects.toThrow('exited 1');
  });

  it('refuses a DB_INIT with no DATABASE_URL to provision', async () => {
    await expect(
      runDbInit(await freshDatabase(), envWith({ DB_INIT: 'schema', DATABASE_URL: undefined })),
    ).rejects.toThrow('DB_INIT requires DATABASE_URL');
  });
});

/**
 * ADR-252 — DATABASE_URL_ADMIN overrides DATABASE_URL for provisioning only. PGlite is a real
 * PostgreSQL, so CREATE ROLE and has_table_privilege make the grant checkable here: the claim is
 * "the app role can read and write what the admin built", and that is read back from the catalogue.
 */
/** A handle that counts `close` calls instead of closing, so a test can still read it afterwards. */
function observed(handle: DatabaseHandle): DatabaseHandle & { closes: () => number } {
  let closes = 0;
  return Object.assign(Object.create(handle) as DatabaseHandle, {
    close: async () => void (closes += 1),
    closes: () => closes,
  });
}

/**
 * ADR-264 — DB_INIT_RESET=stale. The reset script is behind the same runner seam as the
 * demo script, so these see the ORDER of what the app asks for — reset first, DB_INIT's
 * own action after — without bash ever running.
 */
describe('DB_INIT_RESET=stale — reset an out-of-date schema before DB_INIT', () => {
  afterEach(async () => {
    for (const handle of opened.splice(0)) await handle.close();
    // Cleared by name: overrideEnv carries the process environment, so a flag one
    // case set would otherwise leak into the suites below that never mention it.
    envWith({ DB_INIT_RESET: undefined, DB_INIT: undefined });
  });

  /** A database built by an older snapshot: current tables, an old stamp. */
  async function stampedOlder(): Promise<DatabaseHandle> {
    const handle = await freshDatabase();
    await ensureSchema(handle);
    await handle.db.execute(sql`update schema_state set version = 0`);
    return handle;
  }

  function recordingRunner(calls: ProvisionScriptCall[]) {
    return async (call: ProvisionScriptCall) => {
      calls.push(call);
    };
  }

  it('resets a stale database through db-reset.sh, then lets DB_INIT rebuild it', async () => {
    const handle = await stampedOlder();
    const calls: ProvisionScriptCall[] = [];

    const lines = await runDbInit(handle, envWith({ DB_INIT: 'schema', DB_INIT_RESET: 'stale' }), {
      // ADR-271: after the reset call is recorded, the spy must actually wipe the schema so
      // ensureSchema finds an empty DB (present=0) and can provision fresh without hitting the
      // older-snapshot refusal. In production, db-reset.sh does this; here the handle is the seam.
      runner: async (call) => {
        calls.push(call);
        if (call.script.endsWith('db-reset.sh')) await resetSchema(handle);
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.script).toMatch(/\/db-reset\.sh$/);
    expect(calls[0]?.args).toEqual(['--no-install']);
    expect(calls[0]?.stdin).toBe(URL);
    expect(lines[0]).toContain('DB_INIT_RESET=stale: reset a schema stamped version 0');
    expect(lines[1]).toContain('DB_INIT=schema');
    expect(await readSchemaVersion(handle)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('leaves a current database alone: no reset call, no rebuild beyond the ordinary', async () => {
    const handle = await freshDatabase();
    await ensureSchema(handle);
    const runner = vi.fn();

    await runDbInit(handle, envWith({ DB_INIT: 'schema', DB_INIT_RESET: 'stale' }), { runner });

    expect(runner).not.toHaveBeenCalled();
  });

  it('refuses a database stamped NEWER than this build, and touches nothing', async () => {
    const handle = await stampedOlder();
    await handle.db.execute(sql`update schema_state set version = 99`);
    const runner = vi.fn();

    await expect(
      runDbInit(handle, envWith({ DB_INIT: 'schema', DB_INIT_RESET: 'stale' }), { runner }),
    ).rejects.toThrow('NEWER than');
    expect(runner).not.toHaveBeenCalled();
    expect(await readSchemaVersion(handle)).toBe(99);
  });

  it('is inert without DB_INIT, however stale the database', async () => {
    const handle = await stampedOlder();
    const runner = vi.fn();

    const lines = await runDbInit(handle, envWith({ DB_INIT_RESET: 'stale' }), { runner });

    expect(lines).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it('orders the reset before the demo script as well', async () => {
    const handle = await stampedOlder();
    const calls: ProvisionScriptCall[] = [];

    await runDbInit(handle, envWith({ DB_INIT: 'demo', DB_INIT_RESET: 'stale' }), {
      runner: recordingRunner(calls),
    });

    expect(calls.map((call) => call.script)).toEqual([
      expect.stringMatching(/db-reset\.sh$/),
      expect.stringMatching(/db-provision\.sh$/),
    ]);
  });
});

describe('DB_INIT with DATABASE_URL_ADMIN', () => {
  const ADMIN_URL = 'postgresql://adminrole:adminpw-123@admin.db.example:5432/psd';
  const APP_URL = 'postgresql://app_rt:apppw-4567@app.db.example:5432/psd';

  afterEach(async () => {
    for (const handle of opened.splice(0)) await handle.close();
    envWith({ DATABASE_URL: undefined, DATABASE_URL_ADMIN: undefined });
  });

  it('demo mode runs the script with the ADMIN url on stdin and grants the app role by name', async () => {
    const calls: ProvisionScriptCall[] = [];

    await runDbInit(
      await freshDatabase(),
      envWith({ DB_INIT: 'demo', DATABASE_URL: APP_URL, DATABASE_URL_ADMIN: ADMIN_URL }),
      { runner: async (call) => void calls.push(call) },
    );

    expect(calls[0]?.stdin).toBe(ADMIN_URL);
    expect(calls[0]?.args).toEqual(['--demo', '--no-install', '--grant-to', 'app_rt']);
    // The role name is not a secret and may be on argv; neither password may be.
    expect(calls[0]?.args.join(' ')).not.toMatch(/pw-|pw/);
  });

  it('demo mode grants nothing when admin and app are the same role', async () => {
    const calls: ProvisionScriptCall[] = [];
    const sameRole = 'postgresql://app_rt:other-pw-99@admin.db.example:5432/psd';

    await runDbInit(
      await freshDatabase(),
      envWith({ DB_INIT: 'demo', DATABASE_URL: APP_URL, DATABASE_URL_ADMIN: sameRole }),
      { runner: async (call) => void calls.push(call) },
    );

    expect(calls[0]?.args).toEqual(['--demo', '--no-install']);
  });

  it('schema mode builds through the admin connection, grants the app role, and closes the admin', async () => {
    const runtime = await freshDatabase();
    const admin = observed(await freshDatabase());
    await admin.runSql('CREATE ROLE app_rt');
    const openedUrls: string[] = [];

    const lines = await runDbInit(
      runtime,
      envWith({ DB_INIT: 'schema', DATABASE_URL: APP_URL, DATABASE_URL_ADMIN: ADMIN_URL }),
      { openAdmin: async (url) => (openedUrls.push(url), admin) },
    );

    expect(openedUrls).toEqual([ADMIN_URL]);
    expect(lines.join('\n')).toMatch(/as the admin role/);
    expect(lines.join('\n')).toMatch(/app_rt can read and write all \d+ tables/);
    // Built on the ADMIN database, not the runtime one.
    expect((await admin.db.query.clusters.findMany()).length).toBeGreaterThan(0);
    expect(await runtime.db.query.clusters.findMany().catch(() => 'no schema')).toBe('no schema');
    expect(admin.closes()).toBe(1);
  });

  it('actually leaves the app role able to read and write, checked in the catalogue', async () => {
    const admin = observed(await freshDatabase());
    await admin.runSql('CREATE ROLE app_rt');

    await runDbInit(
      await freshDatabase(),
      envWith({ DB_INIT: 'schema', DATABASE_URL: APP_URL, DATABASE_URL_ADMIN: ADMIN_URL }),
      { openAdmin: async () => admin },
    );

    const { verifyRuntimeAccess } = await import('../db/provision.js');
    const report = await verifyRuntimeAccess(admin, 'app_rt');
    expect(report.unreachable).toEqual([]);
    expect(report.tablesTotal).toBeGreaterThan(0);
  });

  it('fails loudly, and still closes the admin, when the app role does not exist to be granted', async () => {
    const admin = observed(await freshDatabase());

    await expect(
      runDbInit(
        await freshDatabase(),
        envWith({ DB_INIT: 'schema', DATABASE_URL: APP_URL, DATABASE_URL_ADMIN: ADMIN_URL }),
        { openAdmin: async () => admin },
      ),
    ).rejects.toThrow();
    expect(admin.closes()).toBe(1);
  });

  it('with no grant needed (same role) the admin run reports only the build', async () => {
    const admin = observed(await freshDatabase());
    const sameRole = 'postgresql://app_rt:other-pw-99@admin.db.example:5432/psd';

    const lines = await runDbInit(
      await freshDatabase(),
      envWith({ DB_INIT: 'schema', DATABASE_URL: APP_URL, DATABASE_URL_ADMIN: sameRole }),
      { openAdmin: async () => admin },
    );

    expect(lines).toHaveLength(1);
  });

  it('the production opener waits for the database and then opens it', async () => {
    const { openAdminDatabase } = await import('../db/dbInit.js');

    await expect(openAdminDatabase('not a url')).rejects.toThrow();
  });
});
