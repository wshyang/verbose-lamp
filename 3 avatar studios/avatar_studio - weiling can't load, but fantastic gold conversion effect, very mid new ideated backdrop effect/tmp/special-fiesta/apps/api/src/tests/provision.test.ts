import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { openInMemoryDatabase, type DatabaseHandle } from '../db/client.js';
import { ensureSchema, schemaStatus } from '../db/bootstrap.js';
import { rowsOf } from '../db/rows.js';
import {
  assertSafeRoleName,
  describeIdentity,
  describeAccess,
  describeRoles,
  describeTarget,
  explainFailure,
  grantRuntimeAccess,
  inspectDatabase,
  missingDdlAdvice,
  parseProvisionArgs,
  roleNameFrom,
  surveyRoles,
  verifyRuntimeAccess,
} from '../db/provision.js';

/**
 * ADR-178 — the managed-database deployment, where the app's role may read and write but not
 * build.
 *
 * These tests are not hypothetical. The failure they pin took a deployment down: the container
 * crash-looped every ten seconds with `permission denied for schema public` while the tunnel
 * answered nothing, and the first fix anyone reaches for — provision it from a laptop with an
 * admin credential — does NOT work on its own, because Postgres checks the CREATE privilege
 * before it checks `IF NOT EXISTS`. So the second test below is the important one.
 *
 * PGlite is a real PostgreSQL, so `CREATE ROLE` and `SET ROLE` reproduce the whole thing in
 * process. That is worth more than a mock: the behaviour under test is Postgres's, not ours.
 */

const SCHEMA = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql');

let handle: DatabaseHandle | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
});

/** A database owned by us, with a second role that has USAGE on public and nothing more. */
async function withRestrictedRole(): Promise<DatabaseHandle> {
  const opened = await openInMemoryDatabase();
  handle = opened;
  await opened.runSql(`CREATE ROLE approle LOGIN;
    GRANT USAGE ON SCHEMA public TO approle;`);
  return opened;
}

async function becomeRestricted(target: DatabaseHandle): Promise<void> {
  await target.runSql('SET ROLE approle');
}

describe('inspectDatabase', () => {
  it('reports the role, the database and what it may do', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;

    const identity = await inspectDatabase(opened);
    expect(identity.role).toBe('postgres');
    expect(identity.canUsePublic).toBe(true);
    expect(identity.canCreatePublic).toBe(true);
    // PG15+ hands the public schema to pg_database_owner — the fact the whole ADR rests on.
    expect(identity.publicSchemaOwner).toBe('pg_database_owner');
    expect(describeIdentity(identity)).toContain('holds USAGE+CREATE');
  });

  it('sees a role that may use the schema but not build in it', async () => {
    const opened = await withRestrictedRole();
    await becomeRestricted(opened);

    const identity = await inspectDatabase(opened);
    expect(identity.role).toBe('approle');
    expect(identity.canUsePublic).toBe(true);
    expect(identity.canCreatePublic).toBe(false);
    expect(describeIdentity(identity)).toContain('holds USAGE');
    expect(describeIdentity(identity)).not.toContain('CREATE');
  });
});

describe('ensureSchema without DDL rights', () => {
  /**
   * The test that justifies the whole change. Before it, this case threw `permission denied for
   * schema public` against a database with nothing whatsoever wrong with it, forever.
   */
  it('verifies a complete schema instead of trying to re-apply it', async () => {
    const opened = await withRestrictedRole();
    // Someone with an admin credential provisioned it already — `db-provision.sh`, in real life.
    await ensureSchema(opened);
    await grantRuntimeAccess(opened, 'approle');
    await becomeRestricted(opened);

    await expect(ensureSchema(opened)).resolves.toBe('verified');
  });

  it('still refuses, naming the remedy, when the schema is actually incomplete', async () => {
    const opened = await withRestrictedRole();
    await becomeRestricted(opened);

    // Not a bare 42501: the role, the database, the count, and the two ways out.
    await expect(ensureSchema(opened)).rejects.toThrow(/missing \d+ of \d+ tables/);
    await expect(ensureSchema(opened)).rejects.toThrow(/GRANT USAGE, CREATE ON SCHEMA public/);
    await expect(ensureSchema(opened)).rejects.toThrow(/db-provision\.sh/);
  });

  it('proves the premise: Postgres refuses CREATE IF NOT EXISTS even when it exists', async () => {
    const opened = await withRestrictedRole();
    await opened.runSql('CREATE TABLE already_here (a int)');
    await becomeRestricted(opened);

    /*
     * If this ever starts passing, Postgres changed and `verifyWithoutDdl` could be dropped.
     * Pinned as a test rather than a comment, because that is the kind of assumption which
     * quietly stops being true.
     */
    // `runSql`, not Drizzle's `execute`: the wrapper replaces the driver's message with
    // "Failed query: …", which is exactly the kind of helpful-looking erasure this ADR is about.
    await expect(opened.runSql('CREATE TABLE IF NOT EXISTS already_here (a int)')).rejects.toThrow(
      /permission denied for schema public/,
    );
  });
});

describe('grantRuntimeAccess', () => {
  it('lets the runtime role read and write tables it did not create', async () => {
    const opened = await withRestrictedRole();
    await ensureSchema(opened);
    await grantRuntimeAccess(opened, 'approle');
    await becomeRestricted(opened);

    await opened.db.execute(sql`insert into cluster (code, display_name) values ('ZZ', 'Probe')`);
    const after = await opened.db.execute<{ total: number }>(
      sql`select count(*)::int as total from cluster where code = 'ZZ'`,
    );
    expect(after.rows[0]?.total).toBe(1);
  });

  /**
   * The grant that is easy to forget. `GRANT ... ON ALL TABLES` covers the tables that exist at
   * that instant; the snapshot grows (`agenda_item` arrived this week), and without default
   * privileges the next table provisioned would be invisible to the app.
   */
  it('covers tables created after the grant, not just the ones standing at the time', async () => {
    const opened = await withRestrictedRole();
    await ensureSchema(opened);
    await grantRuntimeAccess(opened, 'approle');
    await opened.runSql('CREATE TABLE added_later (a int)');
    await becomeRestricted(opened);

    await expect(opened.db.execute(sql`select count(*) from added_later`)).resolves.toBeDefined();
  });

  it('refuses a role name it would have to concatenate blindly', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;

    await expect(grantRuntimeAccess(opened, 'app"; DROP TABLE cluster; --')).rejects.toThrow(
      /Refusing to build a GRANT/,
    );
    expect(() => assertSafeRoleName('jit_107262_202610060742')).not.toThrow();
    expect(() => assertSafeRoleName('')).toThrow();
  });
});

describe('verifyRuntimeAccess', () => {
  it('confirms the app role can reach every table once granted', async () => {
    const opened = await withRestrictedRole();
    await ensureSchema(opened);
    await grantRuntimeAccess(opened, 'approle');

    const report = await verifyRuntimeAccess(opened, 'approle');
    expect(report.exists).toBe(true);
    expect(report.canUseSchema).toBe(true);
    expect(report.tablesTotal).toBeGreaterThan(20);
    expect(report.unreachable).toEqual([]);
    expect(describeAccess(report)).toMatch(/can read and write all \d+ tables/);
  });

  /**
   * THE test for this platform. The managed provider mints a fresh just-in-time admin for every
   * maintenance window — `jit_107262_202610060742`, timestamp in the name — so the next
   * provisioning run is a DIFFERENT role, and ALTER DEFAULT PRIVILEGES set by the previous one
   * does not cover what this one creates. Without the verification step, the operator sees a
   * clean provisioning run and the app crashes on a table it cannot read.
   */
  it('catches a table a LATER just-in-time admin created outside the earlier grant', async () => {
    const opened = await withRestrictedRole();
    await opened.runSql('CREATE ROLE jit_a SUPERUSER LOGIN; CREATE ROLE jit_b SUPERUSER LOGIN;');

    await opened.runSql(`SET ROLE jit_a;
      CREATE TABLE made_by_a (x int);
      GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO approle;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO approle;
      RESET ROLE;`);
    await opened.runSql('SET ROLE jit_b; CREATE TABLE made_by_b (x int); RESET ROLE;');

    const report = await verifyRuntimeAccess(opened, 'approle');
    expect(report.unreachable).toContain('made_by_b');
    expect(report.unreachable).not.toContain('made_by_a');
    expect(describeAccess(report)).toContain('made_by_b');

    // And re-running the explicit grant — what `--grant-to` does every run — closes it.
    await grantRuntimeAccess(opened, 'approle');
    expect((await verifyRuntimeAccess(opened, 'approle')).unreachable).toEqual([]);
  });

  /**
   * Observed on the real platform: dialling in as `jit_107262_202610060742` and finding
   * `current_user` is `prod_role_ddl`. The login name is mapped onto a stable role, so the
   * username in the app's connection string is not reliably the role to GRANT to — and a GRANT
   * at a role that does not exist fails silently. The remedy has to be in the message.
   */
  it('offers the roles that do exist when the named one does not', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;
    await opened.runSql('CREATE ROLE prod_role_ddl LOGIN; CREATE ROLE prod_role_app LOGIN;');

    const report = await verifyRuntimeAccess(opened, 'jit_107262_202610060742');
    expect(report.exists).toBe(false);
    expect(report.candidates).toContain('prod_role_app');
    expect(report.candidates).toContain('prod_role_ddl');
    // PostgreSQL's own roles are never the answer and would bury the two that are.
    expect(report.candidates.some((name) => name.startsWith('pg_'))).toBe(false);

    const described = describeAccess(report);
    expect(described).toContain('No role named jit_107262_202610060742');
    expect(described).toContain('prod_role_app');
    expect(described).toContain('--inspect');
  });

  it('reports a role that exists but was never let into the schema', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;
    await opened.runSql('CREATE ROLE outsider LOGIN; REVOKE USAGE ON SCHEMA public FROM PUBLIC;');

    expect(describeAccess(await verifyRuntimeAccess(opened, 'outsider'))).toContain(
      'cannot even USAGE schema public',
    );
  });
});

describe('surveyRoles', () => {
  /**
   * The situation this exists for: the platform injects the app's connection string into the
   * container as a hidden variable, so nobody deploying can read the username out of it. The
   * database is then the only witness to what the app connects as.
   */
  it('lists the login roles, excluding PostgreSQL\u2019s own', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;
    await opened.runSql('CREATE ROLE prod_role_app LOGIN; CREATE ROLE prod_role_ddl LOGIN;');

    const survey = await surveyRoles(opened);
    expect(survey.logins).toContain('prod_role_app');
    expect(survey.logins).toContain('prod_role_ddl');
    expect(survey.logins.some((role) => role.startsWith('pg_'))).toBe(false);
  });

  it('points at the single other role when there is only one', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;
    await opened.runSql('CREATE ROLE prod_role_app LOGIN;');

    const described = describeRoles(await surveyRoles(opened), 'postgres');
    expect(described).toContain('prod_role_app');
    expect(described).toMatch(/only one role here is not us/);
  });

  it('says to start the app when nothing else is connected', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;

    expect(describeRoles(await surveyRoles(opened), 'postgres')).toMatch(
      /start the app and re-run/,
    );
  });

  it('reads a live connection as the strongest evidence', () => {
    // PGlite is one in-process connection, so the live-backend branch is shaped here directly.
    const described = describeRoles(
      { logins: ['prod_role_ddl', 'prod_role_app'], connected: ['prod_role_app'] },
      'prod_role_ddl',
    );
    expect(described).toContain('connected to this database right now: prod_role_app');
    expect(described).toMatch(/crash-looping app reconnects/);
  });
});

describe('what a verified boot actually proves', () => {
  /**
   * ADR-180 — `tablesMissingFrom` reads `information_schema.tables`, which PostgreSQL filters by
   * privilege: a role sees only the tables it holds SOME privilege on. That is load-bearing and
   * entirely accidental. It means `[api] schema verified` on a role that cannot run DDL is not
   * just a catalogue count — a role with USAGE on the schema but no table grants would report
   * every table MISSING and the app would refuse to boot rather than 500 on first query.
   *
   * Swapping this to `pg_catalog.pg_tables` (unfiltered, and the obvious "fix" for anyone who
   * notices information_schema is slow) would silently destroy that property. Hence this test.
   */
  it('counts only tables the role may actually touch', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;
    await opened.runSql(`
      create table alpha (id int);
      create table beta (id int);
      create role seeing_role login;
      grant usage on schema public to seeing_role;
      grant select on alpha to seeing_role;
    `);

    await opened.runSql('set role seeing_role');
    const visible = rowsOf(
      await opened.db.execute(
        sql`select table_name from information_schema.tables where table_schema = 'public'`,
      ),
    ).map((row) => row['table_name']);
    const everything = rowsOf(
      await opened.db.execute(
        sql`select tablename from pg_catalog.pg_tables where schemaname = 'public'`,
      ),
    ).map((row) => row['tablename']);
    await opened.runSql('reset role');

    // The granted table is seen; the ungranted one is invisible even though it plainly exists.
    expect(visible).toEqual(['alpha']);
    expect(everything).toEqual(expect.arrayContaining(['alpha', 'beta']));
  });
});

describe('an unprovisioned database', () => {
  /**
   * The trap, found by granting PUBLIC on a database whose schema had never been built: the
   * grant succeeds, covers nothing, and the old wording — "can read and write all 0 tables.
   * The app will boot." — read as a pass. It is the opposite of a pass.
   */
  it('is reported as empty, not as a role with perfect access', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;
    await grantRuntimeAccess(opened, 'PUBLIC');

    const report = await verifyRuntimeAccess(opened, 'PUBLIC');
    expect(report.tablesTotal).toBe(0);
    expect(report.unreachable).toEqual([]);

    const described = describeAccess(report);
    expect(described).toContain('NO TABLES');
    expect(described).not.toContain('will boot');
  });

  it('counts how much of the snapshot is actually there', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;

    const before = await schemaStatus(opened);
    expect(before.expected).toBeGreaterThan(20);
    expect(before.missing).toHaveLength(before.expected);

    await ensureSchema(opened);
    expect((await schemaStatus(opened)).missing).toEqual([]);
  });
});

describe('granting to PUBLIC', () => {
  /**
   * The last resort for a platform that hides the app's role entirely. Blunt, and verifiable:
   * PUBLIC has no pg_roles row but has_*_privilege resolves it, and every role inherits it.
   */
  it('grants to the pseudo-role and verifies, where quoting it would fail', async () => {
    const opened = await openInMemoryDatabase();
    handle = opened;
    await ensureSchema(opened);
    await opened.runSql('CREATE ROLE latecomer LOGIN');

    await grantRuntimeAccess(opened, 'PUBLIC');

    const report = await verifyRuntimeAccess(opened, 'PUBLIC');
    expect(report.exists).toBe(true);
    expect(report.unreachable).toEqual([]);
    // The point of PUBLIC: a role nobody granted anything to still inherits it.
    expect((await verifyRuntimeAccess(opened, 'latecomer')).unreachable).toEqual([]);
  });
});

describe('roleNameFrom', () => {
  it('takes the username out of a connection string so nobody retypes a generated role', () => {
    expect(roleNameFrom('postgresql://jit_107262_202610060742:pw@host/db?sslmode=require')).toBe(
      'jit_107262_202610060742',
    );
    // A bare name is passed straight through — both spellings have to work.
    expect(roleNameFrom('app_role')).toBe('app_role');
    expect(() => roleNameFrom('postgresql://host/db')).toThrow(/no username/);
  });
});

describe('missingDdlAdvice', () => {
  it('names the role, the database and both remedies', async () => {
    const opened = await withRestrictedRole();
    await becomeRestricted(opened);
    const advice = missingDdlAdvice(await inspectDatabase(opened));

    expect(advice).toContain('approle');
    expect(advice).toContain('GRANT USAGE, CREATE ON SCHEMA public TO "approle"');
    expect(advice).toContain('--grant-to approle');
  });
});

describe('describeTarget', () => {
  it('names the target without ever repeating the password', () => {
    const url = 'postgresql://jit_1072:mjvRoh4RdZc9@ep-cool.ap-southeast-1.example.com/dbr?sslmode=require';
    const described = describeTarget(url);

    expect(described).toBe('jit_1072@ep-cool.ap-southeast-1.example.com/dbr');
    expect(described).not.toContain('mjvRoh4RdZc9');
  });

  it('keeps a port, and says so rather than echoing a string it cannot read', () => {
    expect(describeTarget('postgresql://u:p@host:6543/db')).toBe('u@host:6543/db');
    expect(describeTarget('not a url at all')).toBe('(unparseable connection string)');
  });
});

describe('parseProvisionArgs', () => {
  it('takes the connection string positionally or by flag, with the options', () => {
    expect(parseProvisionArgs(['postgresql://u:p@h/d', '--demo'])).toEqual({
      url: 'postgresql://u:p@h/d',
      demo: true,
      inspectOnly: false,
      resetOnly: false,
      grantTo: null,
    });
    expect(parseProvisionArgs(['--reset']).resetOnly).toBe(true);
    expect(parseProvisionArgs(['--url', 'postgres://h/d', '--grant-to', 'app']).grantTo).toBe('app');
    expect(parseProvisionArgs(['--inspect']).inspectOnly).toBe(true);
    expect(parseProvisionArgs([]).url).toBeNull();
  });

  it('refuses what it does not understand rather than quietly ignoring it', () => {
    // The dangerous case: a mistyped --inspect that runs a full provision instead.
    expect(() => parseProvisionArgs(['--inspekt'])).toThrow(/Unrecognised argument/);
    expect(() => parseProvisionArgs(['--grant-to'])).toThrow(/needs a value/);
  });
});

describe('explainFailure', () => {
  it('digs the driver\u2019s reason out from under the wrapper\u2019s SQL dump', () => {
    // Shaped like the real thing: Drizzle\u2019s message is the whole query, the reason is nested.
    const driver = new Error('connect ECONNREFUSED 10.0.0.5:5432');
    const wrapped = new Error('Failed query: select current_user...', { cause: driver });

    expect(explainFailure(wrapped)).toBe('connect ECONNREFUSED 10.0.0.5:5432');
    expect(explainFailure(new Error('plain'))).toBe('plain');
    expect(explainFailure('not an error at all')).toBe('not an error at all');
  });

  it('survives a cause that points back at itself', () => {
    const loop = new Error('round and round');
    (loop as { cause?: unknown }).cause = loop;
    expect(explainFailure(loop)).toBe('round and round');
  });
});

describe('the snapshot itself', () => {
  it('is applied whole, so a failed provision leaves nothing half-built', async () => {
    // schema.sql wraps itself in BEGIN/COMMIT. That is what made the real outage recoverable:
    // the crash-looping container never left a partial schema behind to clean up.
    const text = await readFile(SCHEMA, 'utf8');
    // The leading lines are the file's own commentary, so this is the first STATEMENT.
    const statements = text.split('\n').filter((line) => !line.trimStart().startsWith('--'));
    expect(statements.find((line) => line.trim() !== '')).toBe('BEGIN;');
    expect(text.trimEnd().endsWith('COMMIT;')).toBe(true);
  });
});
