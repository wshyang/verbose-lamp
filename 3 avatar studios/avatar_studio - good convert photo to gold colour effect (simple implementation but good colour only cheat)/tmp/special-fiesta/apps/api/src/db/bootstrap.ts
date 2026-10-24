import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { getEnv } from '../env.js';
import type { DatabaseHandle } from './client.js';
import { rowsOf } from './rows.js';
import { inspectDatabase, missingDdlAdvice, type DatabaseIdentity } from './provision.js';

/**
 * Brings a database up to the current schema (ADR-049, ADR-102).
 *
 * ADR-102 — the data story is THREE tiers, three SQL files, strictly separated:
 *   1. `schema.sql`       — DDL only. Tables, indexes, constraints. Never a row.
 *   2. `seed-default.sql` — what every install starts with: the initial superadmin and the
 *                           named facilitator accounts. Applied by `db/seed.ts`.
 *   3. `seed-demo.sql`    — a full recorded demo day, applied only when `PSD_SEED=demo`
 *                           and only into a database with no participants. Generated, not
 *                           hand-written: `npm run db:export-demo`.
 *
 * There are no migrations. While the app is pre-production there is nothing deployed to
 * migrate *from*, so nine numbered files each describing a step nobody will ever take again were
 * pure ceremony — and worse, a second place for the schema to live and drift. `schema.sql` is
 * the single definition, applied whole to any database that does not have it yet.
 *
 * "Does not have it yet" used to be answered by asking Postgres whether ONE known table existed.
 * That was wrong in a way that only shows up on somebody else's machine: a database provisioned
 * by an older snapshot has the sentinel and not the tables added since, so the check reported
 * "present", nothing was applied, and the boot died further down inside the seed with a bare
 * `relation "..." does not exist` — naming neither the cause nor the remedy. A single probe can
 * only tell you provisioning once STARTED.
 *
 * Since every statement in the snapshot is `IF NOT EXISTS` and the file is wrapped in its own
 * BEGIN/COMMIT, the honest reading of "applied whole to any database that does not have it yet"
 * is to apply it on EVERY boot and let Postgres do the deciding. Completeness is then only used
 * to report what happened, and it compares the full list of tables the snapshot defines against
 * the ones that exist — not a sentinel, and not a first/last pair, which would still miss a
 * table absent from the middle.
 *
 * This is not a migration system and does not pretend to be: `IF NOT EXISTS` adds what is
 * missing, so a table or index added since is created, but a column whose TYPE changed in place
 * is not altered. For a pre-production repo where the remedy is `./dev-reset.sh`, adding the
 * missing table is the difference between a working morning and a stack trace.
 *
 * This is deliberately idempotent and safe to call on every boot, which is what makes it the
 * first-run bootstrap for a fresh Postgres container as well (ADR-051): point `DATABASE_URL` at an
 * empty database, start the app, and it provisions itself.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(HERE, 'schema.sql');
const DEMO_SEED = join(HERE, 'seed-demo.sql');

/**
 * ADR-264 — the version of this snapshot, stamped into `schema_state` whenever the snapshot
 * is applied. Bumped BY HAND, in the same change, whenever `schema.sql` changes in a way the
 * additive self-repair cannot heal (a type changed in place, a CHECK tightened, a column
 * dropped): that judgement is exactly the one the bump exists to record, so no hash makes it.
 */
export const CURRENT_SCHEMA_VERSION = 5; // ADR-334: tournament_scheduler.pipeline_spec, tournament_group.superseded_at, match 'superseded'

/**
 * ADR-270 — tables an older snapshot created and this one no longer defines. `resetSchema` drops
 * these as well as the live list: a reset parses only the CURRENT file, so without this list a
 * stale database would keep the old tournament tables (and their foreign keys into the tables the
 * reset rebuilds) standing beside the new schema. Append, never prune — an entry costs one
 * `DROP TABLE IF EXISTS` against a database that has long since lost the table.
 */
const RETIRED_TABLES: readonly string[] = [
  'court',
  'tournament_plan',
  'tournament_entry',
  'tournament_fixture',
  // `tournament`, `tournament_match` and `tournament_stage` are names the rebuilt schema (ADR-275)
  // defines again, so the live list already drops them.
  'manual_day',
  'manual_team',
  'manual_match',
  'manual_draw',
  'manual_slot',
  'manual_advance',
];

/** The version a database was built by: the stamp, or 0 where no stamp exists yet. */
export async function readSchemaVersion(handle: DatabaseHandle): Promise<number> {
  const marker = await handle.db.execute<{ present: boolean }>(
    sql`select to_regclass('public.schema_state') is not null as present`,
  );
  if (rowsOf(marker)[0]?.present !== true) return 0;
  const rows = await handle.db.execute<{ version: number }>(
    sql`select version from schema_state where singleton = true`,
  );
  return rowsOf(rows)[0]?.version ?? 0;
}

/** Record that this build's snapshot now stands in the database (ADR-264). */
async function stampSchemaVersion(handle: DatabaseHandle): Promise<void> {
  await handle.db.execute(
    sql`insert into schema_state (singleton, version) values (true, ${CURRENT_SCHEMA_VERSION})
        on conflict (singleton) do update set version = excluded.version, applied_at = now()`,
  );
}

/**
 * ADR-264 — drop what this snapshot defines, and nothing else.
 *
 * The expected-table list is parsed from schema.sql itself, so the reset and the snapshot
 * cannot drift apart; other tenants of the same database (extensions, another app's tables)
 * are not this function's business. Refuses when the role does not own what exists: dropping
 * is an owner's act, and a refusal that names the provisioning remedy beats a bare
 * `must be owner` from inside a CASCADE.
 */
export async function resetSchema(handle: DatabaseHandle): Promise<string[]> {
  const schemaSql = await readFile(SCHEMA, 'utf8');
  const expected = [...new Set([...tablesDefinedBy(schemaSql), ...RETIRED_TABLES])];
  const missing = await tablesMissingFrom(handle, expected);
  const present = expected.filter((name) => !missing.includes(name));
  const foreign = await tablesNotOwned(handle, expected);
  if (foreign.length > 0) {
    throw new Error(
      [
        `This role cannot reset the schema: it does not own ${foreign.length} of the tables`,
        `that exist (${foreign.slice(0, 4).join(', ')}${foreign.length > 4 ? ', …' : ''}), and`,
        'PostgreSQL requires ownership to drop a table.',
        '',
        'Provision as the role that owns them: set DB_INIT with DATABASE_URL_ADMIN, or run',
        "  ./db-provision.sh 'postgresql://ADMIN:...@host/db' --grant-to <this role>",
      ].join('\n'),
    );
  }
  if (present.length > 0) {
    await handle.runSql(
      present.map((name) => `DROP TABLE IF EXISTS ${name} CASCADE;`).join('\n'),
    );
  }
  return present;
}

/**
 * What applying the snapshot turned out to do, so the caller can log the truth.
 *
 * `verified` is the managed-database case (ADR-178): the role may not run DDL, the schema is
 * already complete, and the honest report is "checked, did not touch".
 */
export type SchemaOutcome = 'provisioned' | 'repaired' | 'unchanged' | 'verified';

/** Every table the snapshot defines, read from the snapshot itself so the two cannot drift. */
function tablesDefinedBy(schemaSql: string): string[] {
  return [...schemaSql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(([, name]) => name ?? '');
}

/**
 * ADR-180 — `information_schema.tables` is PRIVILEGE-FILTERED, and that is load-bearing here.
 *
 * PostgreSQL shows a role only the tables it holds some privilege on. `pg_catalog.pg_tables` is
 * the unfiltered equivalent and is the obvious swap for anyone who finds information_schema slow
 * — do not make it. On the managed-database path (ADR-178) the app cannot run DDL, so this count
 * is the ONLY thing standing between a boot and a server that answers every request with
 * `permission denied for table …`: a role with USAGE on the schema but no table grants sees an
 * empty catalogue, reports every table missing, and is refused a boot it could not have served.
 *
 * Measured, not assumed: a role granted SELECT on one of two tables sees exactly one here and
 * both in `pg_tables`. Pinned in provision.test.ts.
 */
async function tablesMissingFrom(handle: DatabaseHandle, expected: string[]): Promise<string[]> {
  const result = await handle.db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public'`,
  );
  const present = new Set(rowsOf(result).map((row) => row.table_name));
  return expected.filter((name) => !present.has(name));
}

function outcomeOf(missing: number, expected: number): SchemaOutcome {
  if (missing === 0) return 'unchanged';
  return missing === expected ? 'provisioned' : 'repaired';
}

/**
 * ADR-255 — the expected tables this role neither owns nor inherits ownership of.
 *
 * `pg_tables`, not `information_schema`: ownership is the question, and the privilege-filtered view
 * (ADR-180) would hide exactly the tables a role has no privilege on. `pg_has_role(…, 'USAGE')` is
 * true for the owner itself and for any member of the owning role, which is how a platform's login
 * user maps onto its stable role.
 */
async function tablesNotOwned(handle: DatabaseHandle, expected: string[]): Promise<string[]> {
  const result = await handle.db.execute<{ tablename: string }>(
    sql`select tablename from pg_catalog.pg_tables
        where schemaname = 'public' and not pg_has_role(current_user, tableowner, 'USAGE')`,
  );
  const foreign = new Set(rowsOf(result).map((row) => row.tablename));
  return expected.filter((name) => foreign.has(name));
}

/**
 * ADR-255 — a role that can CREATE in the schema but does not own what is already there.
 *
 * Provisioned by an admin (DB_INIT with DATABASE_URL_ADMIN, or `db-provision.sh`), every table
 * belongs to the admin. The app role was granted read/write on them, which is all it needs — but
 * `schema.sql` ends in `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, and Postgres demands OWNERSHIP of a
 * table for any ALTER, even one that changes nothing. `canCreatePublic` is true for this role, so
 * the check above waved it through, and the boot died with `must be owner of table …` on a schema
 * with nothing wrong with it. The honest answer is the same as ADR-178's: verify, because applying
 * is impossible. And the same price is paid: a COLUMN added by a later snapshot is not caught here.
 */
function verifyWithoutOwnership(foreign: string[], missing: string[], expected: number): SchemaOutcome {
  if (missing.length === 0) return 'verified';
  throw new Error(
    [
      `This database is missing ${missing.length} of ${expected} tables, and this role cannot add them:`,
      `it does not own ${foreign.length} of the tables that exist (${foreign.slice(0, 4).join(', ')}${foreign.length > 4 ? ', …' : ''}),`,
      'and PostgreSQL requires ownership to alter a table, even to add one column.',
      '',
      'Provision as the role that owns them: set DB_INIT with DATABASE_URL_ADMIN, or run',
      "  ./db-provision.sh 'postgresql://ADMIN:...@host/db' --grant-to <this role>",
    ].join('\n'),
  );
}

/**
 * The read-only-DDL path (ADR-178): verify, because we cannot apply.
 *
 * This is the one place the ADR-049 contract above is deliberately not honoured, and the reason
 * is that honouring it is impossible rather than unwanted — a role without CREATE cannot apply
 * the snapshot to any database, complete or not. So the choice is between booting on a verified
 * schema and not booting at all.
 *
 * What is given up is real and worth naming: completeness here counts TABLES, so a database
 * missing a COLUMN added by a later snapshot passes this check and fails later at the query that
 * wants the column. The self-repair that ADR-049 built — the idempotent ALTERs in the snapshot's
 * tail — cannot run without DDL rights. On a managed database the remedy is to re-run
 * `db-provision.sh` with an admin connection string, which is stated in the error below rather
 * than left for somebody to deduce at the wrong moment.
 */
function verifyWithoutDdl(
  identity: DatabaseIdentity,
  missing: string[],
  expected: number,
): SchemaOutcome {
  if (missing.length === 0) return 'verified';
  throw new Error(
    [
      `This database is missing ${missing.length} of ${expected} tables and this role cannot`,
      'create them.',
      '',
      `  missing: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''}`,
      '',
      missingDdlAdvice(identity),
    ].join('\n'),
  );
}

/**
 * Applies the snapshot, always. Returns what that turned out to mean: `provisioned` for an empty
 * database, `repaired` when the database had some of the schema and is now whole, `unchanged`
 * when there was nothing to do. `index.ts` logs the difference — a `repaired` boot is worth
 * seeing, because it means this database was built by an older snapshot.
 */
export async function ensureSchema(handle: DatabaseHandle): Promise<SchemaOutcome> {
  const schemaSql = await readFile(SCHEMA, 'utf8');
  const expected = tablesDefinedBy(schemaSql);
  const missing = await tablesMissingFrom(handle, expected);
  /*
   * ADR-178 — ask whether we are allowed to build before trying to.
   *
   * Without this the managed-database deployment cannot boot AT ALL, even against a database
   * that is already perfect: Postgres checks the CREATE privilege before it checks `IF NOT
   * EXISTS`, so re-applying a fully-applied snapshot fails exactly as hard as applying it to an
   * empty database. The app would crash-loop forever on a schema with nothing wrong with it.
   */
  await refuseOlderSnapshot(handle, expected.length - missing.length);
  const identity = await inspectDatabase(handle);
  if (!identity.canCreatePublic) return verifyWithoutDdl(identity, missing, expected.length);
  const foreign = await tablesNotOwned(handle, expected);
  if (foreign.length > 0) return verifyWithoutOwnership(foreign, missing, expected.length);
  /*
   * Applied unconditionally, which is what the contract above says and what the early return
   * that used to sit here quietly broke. The difference only shows once the snapshot grows a
   * COLUMN rather than a table: every table is present, so the old check said "unchanged" and
   * applied nothing, and the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` at the foot of the
   * snapshot never ran on the one kind of database that needed it. Completeness is a report,
   * not a gate.
   */
  await handle.runSql(schemaSql);
  // ADR-264 — this build just applied its snapshot, so the stamp moves to its version. The
  // verified paths above return before this line on purpose: they applied nothing.
  await stampSchemaVersion(handle);
  return outcomeOf(missing.length, expected.length);
}

/**
 * ADR-271 — a database built by an OLDER snapshot is refused, never re-stamped.
 *
 * `ensureSchema` stamps whatever it applies, so before this check an old database booted by a
 * newer build was silently stamped current: `CREATE TABLE IF NOT EXISTS` skipped every table it
 * already had, the non-additive change the version bump recorded never reached it, and the one
 * signal that would have traded it in (`DB_INIT_RESET=stale`, ADR-264) was erased by the boot that
 * should have tripped it. An empty database is not stale — it is provisioned — and a database at or
 * above this build's version is left to the paths that already handle it.
 */
async function refuseOlderSnapshot(handle: DatabaseHandle, present: number): Promise<void> {
  if (present === 0) return;
  const version = await readSchemaVersion(handle);
  if (version >= CURRENT_SCHEMA_VERSION) return;
  throw new Error(
    [
      `This database was built by schema version ${version}; this build needs version ${CURRENT_SCHEMA_VERSION},`,
      'and the change between them cannot be applied in place. Refusing to boot rather than run on a',
      'schema the code no longer matches.',
      '',
      'Trade it in (this DROPS the app tables and their rows):',
      '  deployed:  set DB_INIT_RESET=stale beside DB_INIT, or run ./db-reset.sh',
      '  local dev: ./dev-reset.sh',
    ].join('\n'),
  );
}

/** How much of the snapshot is actually in this database. */
export interface SchemaStatus {
  expected: number;
  missing: string[];
}

/**
 * Report completeness without changing anything (ADR-178).
 *
 * `--inspect` has to be able to answer "is this database provisioned?" separately from "may this
 * role write to it", because the two failures look nothing alike and the remedies are different.
 * A grant over an empty database grants nothing at all, and says so only if somebody counts.
 */
export async function schemaStatus(handle: DatabaseHandle): Promise<SchemaStatus> {
  const schemaSql = await readFile(SCHEMA, 'utf8');
  const expected = tablesDefinedBy(schemaSql);
  return { expected: expected.length, missing: await tablesMissingFrom(handle, expected) };
}

/**
 * ADR-102 tier 3 — the demo day, strictly opt-in and strictly once.
 *
 * `PSD_SEED=demo` is the opt-in; an empty `participant` table is the "once". A database that
 * already holds people is NEVER touched — restarting a demo container cannot double the crowd,
 * and setting the flag against a real event database does nothing at all.
 */
export async function ensureDemoData(
  handle: DatabaseHandle,
  path: string = DEMO_SEED,
): Promise<boolean> {
  if (getEnv().PSD_SEED !== 'demo') return false;
  return applyDemoSeed(handle, path);
}

/**
 * The same act, asked for explicitly rather than through the environment (ADR-178).
 *
 * `db-provision.sh --demo` is a person at a terminal naming the database and saying "put the
 * demo day in it", which `PSD_SEED` cannot express: that variable belongs to a container's
 * environment, and the CLI's whole point is to act on a database the local process does not
 * otherwise know about. The "only into a database with no participants" guard is kept HERE, so
 * both doors obey it and neither can double the crowd.
 */
export async function applyDemoSeed(
  handle: DatabaseHandle,
  path: string = DEMO_SEED,
): Promise<boolean> {
  const result = await handle.db.execute<{ total: number }>(
    sql`select count(*)::int as total from participant`,
  );
  if ((rowsOf(result)[0]?.total ?? 0) > 0) return false;
  await handle.runSql(await readFile(path, 'utf8'));
  return true;
}
