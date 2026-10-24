import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { CLUSTER_CODES, PARTICIPANT_TITLES } from '@psd/contracts';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { openDatabase, openInMemoryDatabase, type DatabaseHandle } from '../db/client.js';
import {
  CURRENT_SCHEMA_VERSION,
  ensureDemoData,
  ensureSchema,
  readSchemaVersion,
  resetSchema,
  schemaStatus,
} from '../db/bootstrap.js';
import { runDbInit, type ProvisionScriptCall } from '../db/dbInit.js';
import { getSystemFacilitatorId, seedDatabase } from '../db/seed.js';
import { getEnv, overrideEnv } from '../env.js';
import { rowsOf } from '../db/rows.js';

/**
 * B1–B3, B17 — the bootstrap half of the system: drivers, schema provisioning and the seed.
 *
 * These paths run once per process on boot, so they never appear in a route test. They are
 * exercised here directly, because "the app starts correctly" is a behaviour like any other
 * (fds.md §8.3, AGENTS-database.md §5–§6).
 */

const MISSING_PASSCODE_MESSAGE =
  'SUPERADMIN_INITIAL_PASSCODE environment variable required for initial superadmin seeding.';

const SCHEMA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql');

/**
 * A database provisioned by an OLDER snapshot: everything up to and including the first table,
 * and nothing after it. Built by slicing the real `schema.sql` rather than by hand-writing a
 * CREATE, so it stays faithful when the first table's columns change.
 */
async function databaseFromAnOlderSnapshot(handle: DatabaseHandle): Promise<void> {
  const schema = await readFile(SCHEMA_FILE, 'utf8');
  const firstTable = schema.indexOf('CREATE TABLE IF NOT EXISTS cluster');
  const endOfFirstTable = schema.indexOf(');', firstTable) + ');'.length;
  await handle.runSql(`${schema.slice(0, endOfFirstTable)}\nCOMMIT;`);
}

const opened: DatabaseHandle[] = [];
const temporaryDirs: string[] = [];

async function freshDatabase(): Promise<DatabaseHandle> {
  const handle = await openInMemoryDatabase();
  opened.push(handle);
  return handle;
}

function testEnv(overrides: Record<string, unknown> = {}) {
  return overrideEnv({
    NODE_ENV: 'test',
    DATABASE_DRIVER: 'pglite',
    PGLITE_DATA_DIR: 'memory://',
    SUPERADMIN_INITIAL_PASSCODE: '4242',
    SUPERADMIN_INITIAL_USERNAME: 'superadmin',
    SESSION_TTL_DAYS: 30,
    COOKIE_SECURE: false,
    ...overrides,
  });
}

describe('B1–B3 — database drivers, schema provisioning and seeding', () => {
  afterAll(async () => {
    for (const handle of opened) await handle.close();
    for (const dir of temporaryDirs) await rm(dir, { recursive: true, force: true });
    testEnv();
  });

  it('provisions an empty database from the snapshot, and says so', async () => {
    const handle = await freshDatabase();

    const provisioned = await ensureSchema(handle);

    expect(provisioned).toBe('provisioned');
    // The schema really is there, not merely reported: this is the check that a snapshot which
    // failed halfway cannot pass (ADR-049).
    const clusters = await handle.db.query.clusters.findMany();
    expect(clusters).toEqual([]);
  });

  it('is a no-op on a database that already has the schema', async () => {
    const handle = await freshDatabase();
    await ensureSchema(handle);

    // Idempotent, because it runs on every boot — including against a Postgres server that
    // several app restarts have already provisioned (ADR-050).
    expect(await ensureSchema(handle)).toBe('unchanged');
  });

  /*
   * The defect this pins, reported from a real machine: the dev database had been provisioned by
   * an older snapshot, so `cluster` existed and `participant_title` (ADR-061, added later) did
   * not. Provisioning keyed on "does the sentinel table exist", saw `cluster`, concluded the
   * schema was present and applied nothing — and the boot then died inside the seed with a bare
   * `relation "participant_title" does not exist`, which names neither the cause nor the remedy.
   *
   * ADR-049 keeps one snapshot and no migrations, and the snapshot is every-statement
   * idempotent, so the honest reading of "applied whole to any database that does not have it
   * yet" is to apply it on every boot and let IF NOT EXISTS do the work.
   */
  /*
   * ADR-255 — the deploy failure that pinned this: the admin built the schema and granted the app
   * role read/write, then the app's own boot re-applied schema.sql and died on
   * `must be owner of table facilitator_account`, because its trailing `ALTER TABLE … ADD COLUMN IF
   * NOT EXISTS` needs ownership. The app role HAD create-on-schema, so the old "can it run DDL?"
   * check passed it through.
   */
  async function adminBuiltDatabaseSeenByAppRole(): Promise<DatabaseHandle> {
    const handle = await freshDatabase();
    await ensureSchema(handle);
    await handle.runSql(`CREATE ROLE app_rt LOGIN;
      GRANT USAGE, CREATE ON SCHEMA public TO app_rt;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rt;
      SET ROLE app_rt;`);
    return handle;
  }

  it('verifies, instead of failing on ALTER, when the tables belong to another role', async () => {
    const handle = await adminBuiltDatabaseSeenByAppRole();

    await expect(ensureSchema(handle)).resolves.toBe('verified');

    await handle.runSql('RESET ROLE');
  });

  it('refuses, naming the remedy, when it neither owns the tables nor finds them all', async () => {
    // ADR-255 — provision a full schema first (stamp = CURRENT), then drop one table so the schema is
    // incomplete, then switch to a role that has CREATE but does not own the tables. The ownership
    // check fires because ADR-271 passes (stamp is current), but verifyWithoutOwnership throws because
    // the role cannot fix the missing table without owning the ones that already exist.
    const handle = await freshDatabase();
    await ensureSchema(handle);
    await handle.runSql('DROP TABLE participant_title CASCADE;');
    await handle.runSql(`CREATE ROLE app_rt LOGIN;
      GRANT USAGE, CREATE ON SCHEMA public TO app_rt;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rt;
      SET ROLE app_rt;`);

    await expect(ensureSchema(handle)).rejects.toThrow(/does not own \d+ of the tables.*DATABASE_URL_ADMIN/s);

    await handle.runSql('RESET ROLE');
  });

  it('still applies the snapshot when this role owns the tables (the ordinary self-provisioning boot)', async () => {
    const handle = await freshDatabase();
    await ensureSchema(handle);

    await expect(ensureSchema(handle)).resolves.toBe('unchanged');
  });

  /*
   * ADR-271 — a database built by an OLDER snapshot is refused, not repaired.
   *
   * `databaseFromAnOlderSnapshot` creates a DB with one table (stamp = 0, because the
   * schema_state table itself is absent). `refuseOlderSnapshot` sees present > 0 and
   * version 0 < CURRENT, and throws rather than silently stamping over a schema that may
   * have non-additive differences. The error names both remedies so the operator is not
   * left to work out the command on their own.
   */
  it('ADR-271 — refuses to boot on a DB built by an older snapshot (stamp 0), naming both remedies', async () => {
    testEnv();
    const handle = await freshDatabase();
    await databaseFromAnOlderSnapshot(handle);

    await expect(ensureSchema(handle)).rejects.toThrow(/DB_INIT_RESET=stale/);
    await expect(ensureSchema(handle)).rejects.toThrow(/dev-reset\.sh/);
  });

  /*
   * ADR-168 — the case `CREATE TABLE IF NOT EXISTS` cannot reach.
   *
   * Once a table exists, the create is skipped whole, so a COLUMN added to its definition
   * later never lands on a database provisioned by an older snapshot: every table is present,
   * the completeness check says "unchanged", and the boot then dies on the missing column.
   * The snapshot therefore repeats every such column as an idempotent ALTER, and `ensureSchema`
   * applies the file unconditionally — which is what its contract always claimed.
   */
  it('restores a COLUMN that a later snapshot added to an existing table', async () => {
    testEnv();
    const handle = await freshDatabase();
    await ensureSchema(handle);
    // ADR-168 / ADR-264 — cluster.retired_at was added as an additive ALTER TABLE in a later snapshot
    // (line ~660 in schema.sql). Dropping it simulates a database built before that snapshot landed.
    await handle.runSql('ALTER TABLE cluster DROP COLUMN retired_at;');

    const outcome = await ensureSchema(handle);

    // No table is missing, so there is nothing to "repair" — and the column must come back
    // anyway. Reporting completeness and applying the snapshot are different jobs.
    expect(outcome).toBe('unchanged');
    const columns = await handle.db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns
          where table_name = 'cluster'`,
    );
    expect(rowsOf(columns).map((row) => row.column_name)).toContain('retired_at');
  });

  it('ADR-271 — refuses a non-empty DB stamped version 1, naming DB_INIT_RESET=stale and ./dev-reset.sh', async () => {
    testEnv();
    const handle = await freshDatabase();
    await ensureSchema(handle);
    // Backdate the stamp to simulate a database built by schema version 1
    await handle.db.execute(sql`update schema_state set version = 1`);

    await expect(ensureSchema(handle)).rejects.toThrow(/DB_INIT_RESET=stale/);
    await expect(ensureSchema(handle)).rejects.toThrow(/dev-reset\.sh/);
  });

  it('ADR-270 — resetSchema drops a retired table that is not in the current snapshot', async () => {
    testEnv();
    const handle = await freshDatabase();
    await ensureSchema(handle);
    // Simulate a table left over from a prior schema version (e.g. the old tournament court table)
    await handle.runSql('CREATE TABLE IF NOT EXISTS court (id uuid primary key);');

    const dropped = await resetSchema(handle);

    expect(dropped).toContain('court');
    // The standard app tables are also gone — reset is total for this snapshot's scope
    const status = await schemaStatus(handle);
    expect(status.missing).toContain('cluster');
  });

  it('repairs a snapshot missing a table from the MIDDLE, not just the end', async () => {
    // A two-sentinel check (first table + last table) would pass this and still be broken, so
    // the completeness test has to be the whole table list, not a pair of probes.
    testEnv();
    const handle = await freshDatabase();
    await ensureSchema(handle);
    await handle.runSql('DROP TABLE participant_title CASCADE;');

    expect(await ensureSchema(handle)).toBe('repaired');

    await expect(seedDatabase(handle)).resolves.not.toThrow();
  });

  it('seeds the 18 clusters and the tier-2 default accounts — idempotently (ADR-102)', async () => {
    testEnv();
    const handle = await freshDatabase();
    await ensureSchema(handle);
    await seedDatabase(handle);
    await seedDatabase(handle);

    const clusters = await handle.db.query.clusters.findMany();
    expect(clusters).toHaveLength(18);

    const systemId = await getSystemFacilitatorId(handle);
    expect(systemId).toMatch(/^[0-9a-f-]{36}$/);

    // seed-default.sql: the system actor plus the named marshal accounts, exactly once,
    // with FIXED ids — tier 3's dump references these actors by uuid.
    const facilitators = await handle.db.query.facilitatorAccounts.findMany();
    expect(facilitators.map((row) => row.username).sort()).toEqual([
      'court1',
      'fringe1',
      'fringe2',
      'system',
    ]);
    expect(facilitators.every((row) => row.id.startsWith('fac10000-'))).toBe(true);

    const superadmins = await handle.db.query.superadminAccounts.findMany();
    expect(superadmins).toHaveLength(1);
    expect(superadmins[0]?.passcode).toBe('4242');
  });

  it("renders the superadmin's credentials from the environment, quotes and all", async () => {
    // The template substitution must produce a LITERAL, not a syntax error or an injection:
    // a username carrying a quote is the worst legal case.
    testEnv({ SUPERADMIN_INITIAL_USERNAME: "o'brien", SUPERADMIN_INITIAL_PASSCODE: '9876' });
    const handle = await freshDatabase();
    await ensureSchema(handle);
    await seedDatabase(handle);

    const superadmins = await handle.db.query.superadminAccounts.findMany();
    expect(superadmins[0]?.username).toBe("o'brien");
    expect(superadmins[0]?.passcode).toBe('9876');
    testEnv();
  });

  it('applies the demo tier only when PSD_SEED=demo asks, and only once (ADR-102)', async () => {
    testEnv();
    const handle = await freshDatabase();
    await ensureSchema(handle);
    await seedDatabase(handle);

    const dir = await mkdtemp(join(tmpdir(), 'psd-demo-sql-'));
    temporaryDirs.push(dir);
    const demoFile = join(dir, 'seed-demo.sql');
    await writeFile(
      demoFile,
      `INSERT INTO participant (id, nickname, pin, scan_number, cluster_code, gender, avatar_variant, title)
       VALUES ('00000000-0000-4000-8000-0000000000aa', 'DemoOnly', '1234', '0001',
               '${CLUSTER_CODES[0]}', 'female', 1, '${PARTICIPANT_TITLES[0]}');`,
    );

    // Default tier: the demo file is never touched.
    expect(await ensureDemoData(handle, demoFile)).toBe(false);
    expect(await handle.db.query.participants.findMany()).toHaveLength(0);

    testEnv({ PSD_SEED: 'demo' });
    expect(await ensureDemoData(handle, demoFile)).toBe(true);
    expect(await handle.db.query.participants.findMany()).toHaveLength(1);

    // A database that already holds people is NEVER reseeded — restarts cannot double the crowd.
    expect(await ensureDemoData(handle, demoFile)).toBe(false);
    testEnv();
  });

  /*
   * ADR-264 — the stamp is what turns "missing some tables" into an orderable fact: this
   * database was built by version N, the build carries CURRENT, and N < CURRENT is stale.
   * A database with no stamp at all — every database provisioned before the stamp existed —
   * reads 0, older than any real version.
   */
  it('stamps the schema version on provision, and reads 0 where no stamp exists', async () => {
    const handle = await freshDatabase();
    expect(await readSchemaVersion(handle)).toBe(0);

    await ensureSchema(handle);
    expect(await readSchemaVersion(handle)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('reset drops only the snapshot’s tables, returns the stamp to 0, and keeps other tenants', async () => {
    const handle = await freshDatabase();
    await ensureSchema(handle);
    await handle.db.execute(sql`insert into cluster (code, display_name) values ('ZZ', 'Zulu')`);
    await handle.runSql('CREATE TABLE IF NOT EXISTS another_apps_table (id integer);');

    const dropped = await resetSchema(handle);

    expect(dropped).toContain('cluster');
    expect(dropped).toContain('schema_state');
    expect(await readSchemaVersion(handle)).toBe(0);
    const status = await schemaStatus(handle);
    expect(status.missing).toContain('cluster');
    // Not this app's table: still standing, because a reset is scoped to the snapshot.
    await handle.db.execute(sql`select * from another_apps_table`);
  });

  it('parses DB_INIT_RESET=stale, rejects other values, and leaves it inert without DB_INIT', async () => {
    await expectEnvError({ DB_INIT_RESET: 'everything' }, /DB_INIT_RESET/);
    expect((await parseEnv({ DB_INIT_RESET: '' })).DB_INIT_RESET).toBeUndefined();
    expect((await parseEnv({ DB_INIT_RESET: 'stale' })).DB_INIT_RESET).toBe('stale');
    expect((await parseEnv({})).DB_INIT_RESET).toBeUndefined();
  });

  it('fails loudly when SUPERADMIN_INITIAL_PASSCODE is unset (fds.md §8.3)', async () => {
    testEnv({ SUPERADMIN_INITIAL_PASSCODE: undefined });
    const handle = await freshDatabase();
    await ensureSchema(handle);

    await expect(seedDatabase(handle)).rejects.toThrow(MISSING_PASSCODE_MESSAGE);
    testEnv();
  });

  it('opens an on-disk PGlite database, creating missing parent directories', async () => {
    const base = await mkdtemp(join(tmpdir(), 'psd-pglite-'));
    temporaryDirs.push(base);
    testEnv({ PGLITE_DATA_DIR: join(base, 'nested', 'data') });

    const handle = await openDatabase();
    opened.push(handle);
    await ensureSchema(handle);
    await seedDatabase(handle);

    const clusters = await handle.db.query.clusters.findMany();
    expect(clusters).toHaveLength(18);
    testEnv();
  });

  it('refuses the postgres driver without a connection string', async () => {
    testEnv({ DATABASE_DRIVER: 'postgres', DATABASE_URL: undefined });
    await expect(openDatabase()).rejects.toThrow('DATABASE_URL is required');
    testEnv();
  });

  it('builds a node-postgres handle whose queries surface connection failures', async () => {
    // Port 1 is never a Postgres server: the pool is lazy, so the handle is built and only a
    // query fails. That is exactly the deployed shape (ADR-003) without needing a server here.
    testEnv({ DATABASE_DRIVER: 'postgres', DATABASE_URL: 'postgres://psd:psd@127.0.0.1:1/psd' });
    const handle = await openDatabase();

    await expect(handle.runSql('select 1')).rejects.toThrow();
    await handle.close();
    testEnv();
  });

  it('refuses to start on an unparseable environment instead of guessing a default', async () => {
    vi.resetModules();
    // Bracketed because `process.env` is an index signature, not a known shape
    // (noPropertyAccessFromIndexSignature): PORT may or may not be there, which is the point here.
    const previous = process.env['PORT'];
    process.env['PORT'] = 'not-a-port';
    try {
      const fresh = await import('../env.js');
      expect(() => fresh.getEnv()).toThrowError(/Invalid environment/);
    } finally {
      if (previous === undefined) delete process.env['PORT'];
      else process.env['PORT'] = previous;
      vi.resetModules();
    }
  });

  it('refuses a cookie configuration every browser would silently discard (ADR-015)', async () => {
    await expectRejectedEnv({ COOKIE_SAMESITE: 'None', COOKIE_SECURE: 'false' });
    await expectRejectedEnv({ COOKIE_PARTITIONED: 'true', COOKIE_SECURE: 'false' });
  });

  // ADR-249 — DB_INIT is a closed set, "" means unset (how a platform renders an empty variable),
  // and it is meaningless without the DATABASE_URL it would provision.
  it('parses DB_INIT: schema|demo only, empty is unset, and it needs DATABASE_URL', async () => {
    const url = 'postgresql://app:pw@db.example/psd';

    await expectEnvError({ DB_INIT: 'everything', DATABASE_URL: url }, /DB_INIT/);
    await expectEnvError({ DB_INIT: 'schema', DATABASE_URL: '' }, /DB_INIT requires DATABASE_URL/);
    expect((await parseEnv({ DB_INIT: '' })).DB_INIT).toBeUndefined();
    // ADR-252 — the admin URL is validated like the app's, but only when DB_INIT will use it, and
    // empty means unset.
    await expectEnvError(
      { DB_INIT: 'schema', DATABASE_URL: url, DATABASE_URL_ADMIN: '${NF_ADMIN}' },
      /DATABASE_URL_ADMIN: the value contains the unresolved reference/,
    );
    expect((await parseEnv({ DATABASE_URL_ADMIN: 'not-validated-without-db-init' })).DB_INIT).toBeUndefined();
    expect((await parseEnv({ DATABASE_URL_ADMIN: '' })).DATABASE_URL_ADMIN).toBeUndefined();
    expect((await parseEnv({ DB_INIT: 'schema', DATABASE_URL: url, DATABASE_URL_ADMIN: url })).DATABASE_URL_ADMIN).toBe(url);
    // ADR-251 — a malformed URL is refused at startup by name, and the message never quotes it.
    await expectEnvError({ DATABASE_URL: '${NF_SOME_SECRET}' }, /DATABASE_URL: the value contains the unresolved reference/);
    await expectEnvError({ DATABASE_URL: 'bareSecret123' }, /DATABASE_URL: the value has no "postgresql:\/\/" prefix/);
    expect((await parseEnv({ DB_INIT: 'demo', DATABASE_URL: url })).DB_INIT).toBe('demo');
  });

  // The failure this pins, from a real deploy: the app's DB_INIT=demo spawned db-provision.sh, which
  // unsets DATABASE_URL so a stale one cannot redirect it — but DB_INIT stayed in the child's
  // environment, and the child's own env validation then refused "DB_INIT requires DATABASE_URL".
  it('DB_INIT=demo hands the script an environment without the settings that configure the app', async () => {
    const keys = ['DB_INIT', 'DATABASE_URL_ADMIN', 'DATABASE_URL', 'DATABASE_DRIVER'];
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      DB_INIT: 'demo',
      DATABASE_URL_ADMIN: 'postgresql://a:pw-admin@h/d',
      DATABASE_URL: 'postgresql://u:pw-app@h/d',
      DATABASE_DRIVER: 'postgres',
    });
    const calls: ProvisionScriptCall[] = [];
    try {
      const handle = await freshDatabase();
      await runDbInit(
        handle,
        testEnv({ DB_INIT: 'demo', DATABASE_URL: 'postgresql://u:pw-app@h/d' }),
        { runner: async (call) => void calls.push(call) },
      );
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    const env = calls[0]?.env ?? {};
    for (const key of keys) expect(env[key], key).toBeUndefined();
    expect(env['SUPERADMIN_INITIAL_PASSCODE']).toBe('4242');
  });

  it('getEnv caches the parsed environment and overrideEnv replaces it', () => {
    const first = testEnv({ SESSION_TTL_DAYS: 7 });
    expect(first.SESSION_TTL_DAYS).toBe(7);
    expect(getEnv()).toBe(first);

    const second = testEnv({ SESSION_TTL_DAYS: 30 });
    expect(second.SESSION_TTL_DAYS).toBe(30);
    expect(Object.isFrozen(second)).toBe(true);
  });
});

/**
 * The cross-field cookie rules live in the schema, which only runs on a real parse of
 * `process.env` — `overrideEnv` merges into an already-validated object. Re-importing the
 * module with a hostile environment is how B1 is proven above, so the same shape is reused.
 */
async function expectRejectedEnv(values: Record<string, string>): Promise<void> {
  vi.resetModules();
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    const fresh = await import('../env.js');
    expect(() => fresh.getEnv()).toThrowError(/COOKIE_SECURE/);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
}

/** Parses a hostile `process.env` through a fresh copy of env.ts, restoring the real one after. */
async function parseEnv(values: Record<string, string>): Promise<ReturnType<typeof getEnv>> {
  vi.resetModules();
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === '' && key === 'DATABASE_URL') delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return (await import('../env.js')).getEnv();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
}

async function expectEnvError(values: Record<string, string>, message: RegExp): Promise<void> {
  await expect(parseEnv(values)).rejects.toThrowError(message);
}
