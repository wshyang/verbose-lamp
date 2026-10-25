import { sql } from 'drizzle-orm';
import type { DatabaseHandle } from './client.js';
import { normaliseConnectionString } from './connectionString.js';
import { rowsOf } from './rows.js';

/**
 * Who are we connected as, and may we build anything? (ADR-178)
 *
 * The app provisions itself on boot (ADR-049), which silently assumes the role in `DATABASE_URL`
 * is allowed to run DDL. That holds for the bundled Postgres container, where the app owns its
 * database, and for PGlite, where there is only one role and it is a superuser. It does NOT hold
 * on a managed provider, which typically hands out a role that can read and write but not build.
 *
 * Since PostgreSQL 15 the `public` schema no longer grants CREATE to PUBLIC: it is owned by
 * `pg_database_owner` and everyone else gets USAGE alone. So on a managed database the very first
 * `CREATE TABLE IF NOT EXISTS` in the snapshot fails with SQLSTATE 42501, the process exits, the
 * supervisor restarts it, and the container crash-loops while reporting nothing more useful than
 * `permission denied for schema public`.
 *
 * The hard part is that `IF NOT EXISTS` does not save us. Postgres checks the privilege BEFORE it
 * checks existence, so re-applying a snapshot that is already fully applied fails exactly as hard
 * as applying it to an empty database:
 *
 *   CREATE TABLE IF NOT EXISTS foo (...)   -- table already there -> permission denied for schema public
 *   CREATE INDEX IF NOT EXISTS ix_foo ...  -- index already there -> must be owner of table foo
 *   ALTER TABLE foo ADD COLUMN IF NOT EXISTS ...  -- column already there -> must be owner of table foo
 *
 * That is why provisioning a managed database from a laptop is only half an answer: without the
 * check in `ensureSchema`, the app would still refuse to boot against the database somebody had
 * just provisioned perfectly.
 */

/** What the connected role is and what it is allowed to do, asked of the database itself. */
export interface DatabaseIdentity {
  role: string;
  database: string;
  serverVersion: string;
  /** Owner of schema `public` — `pg_database_owner` on anything created by PG15 or later. */
  publicSchemaOwner: string;
  canUsePublic: boolean;
  /** The one that matters: may this role create objects in `public`? */
  canCreatePublic: boolean;
}

const IDENTITY_QUERY = sql`
  select current_user::text                                as role,
         current_database()::text                          as database,
         current_setting('server_version')::text           as server_version,
         pg_catalog.pg_get_userbyid(n.nspowner)::text      as public_schema_owner,
         has_schema_privilege(current_user, 'public', 'USAGE')  as can_use_public,
         has_schema_privilege(current_user, 'public', 'CREATE') as can_create_public
  from pg_catalog.pg_namespace n
  where n.nspname = 'public'
`;

interface IdentityRow extends Record<string, unknown> {
  role: string;
  database: string;
  server_version: string;
  public_schema_owner: string;
  can_use_public: boolean;
  can_create_public: boolean;
}

/**
 * Asked of the database rather than inferred from the connection string, because the string says
 * what we dialled and this says what we got — a pooler, a role mapping or a `SET ROLE` in a
 * provider's connection hook can make the two disagree.
 */
export async function inspectDatabase(handle: DatabaseHandle): Promise<DatabaseIdentity> {
  const result = await handle.db.execute<IdentityRow>(IDENTITY_QUERY);
  const row = rowsOf(result)[0];
  // No `public` schema at all. Rare, and not something to paper over with defaults: every
  // statement in the snapshot is unqualified, so there is nowhere for them to land.
  if (!row) throw new Error('This database has no schema named "public"; cannot provision it.');
  return {
    role: row.role,
    database: row.database,
    serverVersion: row.server_version,
    publicSchemaOwner: row.public_schema_owner,
    canUsePublic: row.can_use_public,
    canCreatePublic: row.can_create_public,
  };
}

/** One line for a log or a CLI banner. Never derived from the URL, so it cannot leak a password. */
export function describeIdentity(identity: DatabaseIdentity): string {
  const rights = [
    identity.canUsePublic ? 'USAGE' : null,
    identity.canCreatePublic ? 'CREATE' : null,
  ].filter((right) => right !== null);
  return (
    `role ${identity.role} on ${identity.database} ` +
    `(PostgreSQL ${identity.serverVersion}; public owned by ${identity.publicSchemaOwner}; ` +
    `holds ${rights.length > 0 ? rights.join('+') : 'no rights on public'})`
  );
}

/**
 * The remedy, spelled out in SQL the operator can paste.
 *
 * `bootstrap.ts` already carries a complaint about an error that named "neither the cause nor the
 * remedy". A raw 42501 from inside a 47 KB snapshot is precisely that error, so this is the
 * counterpart: the role, the database, and the two ways out.
 */
export function missingDdlAdvice(identity: DatabaseIdentity): string {
  const role = JSON.stringify(identity.role);
  return [
    `The role ${identity.role} cannot create objects in schema "public" of ${identity.database}.`,
    '',
    'Since PostgreSQL 15 the public schema grants CREATE to the database owner only, so a',
    'managed provider\'s application role cannot run DDL. Two ways out:',
    '',
    '  1. Let the app provision itself, by granting it the right (as the database owner):',
    `       GRANT USAGE, CREATE ON SCHEMA public TO ${role};`,
    `     or, equivalently, ALTER DATABASE ${identity.database} OWNER TO ${role};`,
    '',
    '  2. Keep the app out of DDL entirely and provision from somewhere that has an admin',
    '     connection string, granting this role access to what gets built:',
    `       ./db-provision.sh 'postgresql://ADMIN:...@host/db' --grant-to ${identity.role}`,
    '',
    'Option 2 is the right one where runtime DDL is forbidden by policy. The app then verifies',
    'the schema on boot instead of applying it.',
  ].join('\n');
}

/*
 * Role names are interpolated into GRANT statements, which take an identifier rather than a
 * parameter — so there is no placeholder to bind and the name must be proven safe instead.
 * Postgres allows far more than this in a quoted identifier; this is deliberately the boring
 * subset every real provider issues, because the alternative is reasoning about embedded quotes
 * in a string that is about to be concatenated into SQL.
 */
const SAFE_ROLE_NAME = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

export function assertSafeRoleName(role: string): string {
  if (!SAFE_ROLE_NAME.test(role)) {
    throw new Error(
      `Refusing to build a GRANT for the role name ${JSON.stringify(role)}: ` +
        'expected letters, digits, underscore or $, starting with a letter or underscore.',
    );
  }
  return role;
}

/**
 * Give the runtime role everything it needs over a schema somebody else built.
 *
 * The non-obvious half is `ALTER DEFAULT PRIVILEGES`. Granting on ALL TABLES covers the tables
 * that exist at this instant and nothing else, so the next table added to the snapshot — and the
 * snapshot does grow, `agenda_item` was added this week — would be invisible to the app until a
 * human remembered to re-run the grant. Default privileges attach to whatever this admin role
 * creates in future, which is exactly the set of objects a later `db-provision.sh` run will add.
 *
 * Sequences are included although today's schema has none: every key is a uuid. One line now is
 * cheaper than the afternoon somebody spends on `permission denied for sequence` after adding the
 * first `serial` column.
 *
 * BUT default privileges are NOT a substitute for re-running this, and the reason is the whole
 * reason `verifyRuntimeAccess` exists. They attach to the role that ran the ALTER. A platform
 * that mints a fresh just-in-time admin for every maintenance window — `jit_107262_202610060742`,
 * with the timestamp in the name — uses a DIFFERENT role next time, so tables created in the next
 * run are not covered by defaults set in this one. Measured, not assumed:
 *
 *   jit_a: CREATE TABLE made_by_a; ALTER DEFAULT PRIVILEGES ... GRANT SELECT TO approle
 *   jit_b: CREATE TABLE made_by_b
 *   -> approle SELECT on made_by_a: true
 *   -> approle SELECT on made_by_b: FALSE
 *
 * So the rule is: pass `--grant-to` on EVERY provisioning run. The explicit GRANT on ALL TABLES
 * is what actually carries the day; the defaults are a bonus within one admin's tenure.
 */
export function isPublicRole(role: string): boolean {
  return role.toUpperCase() === 'PUBLIC';
}

/**
 * The grantee as SQL. `PUBLIC` is a keyword, not an identifier: quoting it would create a GRANT
 * to a literal role named "PUBLIC", which does not exist, and the statement would fail rather
 * than do the blunt thing the operator asked for.
 */
function grantee(role: string): string {
  return isPublicRole(role) ? 'PUBLIC' : `"${assertSafeRoleName(role)}"`;
}

export async function grantRuntimeAccess(handle: DatabaseHandle, role: string): Promise<void> {
  const name = grantee(role);
  await handle.runSql(
    [
      `GRANT USAGE ON SCHEMA public TO ${name};`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${name};`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${name};`,
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public',
      `  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${name};`,
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public',
      `  GRANT USAGE, SELECT ON SEQUENCES TO ${name};`,
    ].join('\n'),
  );
}

/**
 * `user@host/database` for a banner, with the password removed.
 *
 * Connection strings arrive on argv and in logs that get pasted into chat windows, so this never
 * returns anything that could be used to connect. An unparseable string is reported as such
 * rather than echoed, for the same reason.
 */
export function describeTarget(connectionString: string): string {
  try {
    const url = new URL(normaliseConnectionString(connectionString).url);
    const host = url.port ? `${url.hostname}:${url.port}` : url.hostname;
    const database = url.pathname.replace(/^\//, '') || '(default database)';
    return `${url.username || '(no user)'}@${host}/${database}`;
  } catch {
    return '(unparseable connection string)';
  }
}

/** What `db-provision.sh` was asked to do. */
export interface ProvisionOptions {
  url: string | null;
  demo: boolean;
  inspectOnly: boolean;
  /** ADR-264 — drop the snapshot's tables and stop; provisioning is a separate run. */
  resetOnly: boolean;
  grantTo: string | null;
}

/**
 * A tiny parser, and strict on purpose: an argument nobody recognises is a typo, and a typo that
 * is silently ignored is how somebody runs this against the wrong database believing they passed
 * `--inspect`. A bare `postgres://…` is accepted positionally because that is how a person
 * naturally types it; everything else must be a named flag.
 */
export function parseProvisionArgs(argv: readonly string[]): ProvisionOptions {
  const options: ProvisionOptions = { url: null, demo: false, inspectOnly: false, resetOnly: false, grantTo: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const value = argv[index + 1];
    if (arg === '--demo') options.demo = true;
    else if (arg === '--reset') options.resetOnly = true;
    else if (arg === '--inspect') options.inspectOnly = true;
    else if (arg === '--grant-to' || arg === '--url') {
      if (value === undefined) throw new Error(`${arg} needs a value.`);
      if (arg === '--url') options.url = value;
      else options.grantTo = value;
      index += 1;
    } else if (arg.startsWith('postgres://') || arg.startsWith('postgresql://')) options.url = arg;
    else throw new Error(`Unrecognised argument ${JSON.stringify(arg)}.`);
  }
  return options;
}

/**
 * The message an operator should actually read.
 *
 * Drizzle wraps a driver error in one whose message is the whole failed SQL, so a refused
 * connection or a bad password arrives as 47 lines of `select current_user…` with the real
 * reason — ECONNREFUSED, password authentication failed, no pg_hba.conf entry — hidden in
 * `.cause`. Unwrapping is the difference between "the database said no" and "I cannot tell
 * what went wrong", which is the same complaint this whole module exists to answer.
 */
export function explainFailure(error: unknown): string {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let deepest = error instanceof Error ? error.message : String(error);
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (current.message) deepest = current.message;
    current = (current as { cause?: unknown }).cause;
  }
  return deepest;
}

/**
 * A role name, or the username out of a connection string.
 *
 * The runtime role's name is not something anybody has memorised — it is a generated token like
 * `jit_107262_202610060742` sitting in a connection string the platform pre-populated. Making
 * people retype the username out of it is an invitation to typo a GRANT onto a role that does not
 * exist, which succeeds at nothing and reports success. Any password in the string is discarded
 * here and never printed.
 */
export function roleNameFrom(value: string): string {
  if (!value.startsWith('postgres://') && !value.startsWith('postgresql://')) return value;
  const username = new URL(normaliseConnectionString(value).url).username;
  if (!username) throw new Error('That connection string carries no username to grant to.');
  return decodeURIComponent(username);
}

/** What the runtime role can actually do, asked table by table rather than assumed. */
export interface AccessReport {
  role: string;
  exists: boolean;
  canUseSchema: boolean;
  tablesTotal: number;
  /** Tables the role can neither read nor write — the ones that would break the app. */
  unreachable: string[];
  /** Login roles that DO exist, offered when the named one does not. */
  candidates: string[];
}

/**
 * The roles somebody could have meant.
 *
 * A managed platform authenticates a rotating username and maps it onto a stable role: dialling
 * in as `jit_107262_202610060742` and finding `current_user` is `prod_role_ddl` is normal there,
 * not a misconfiguration. So the username in the app's connection string is not reliably the
 * name of the role to GRANT to — and a GRANT aimed at a role that does not exist is the worst
 * kind of failure, because it is silent. Listing what is actually there turns that dead end into
 * the next step. `pg_` roles are PostgreSQL's own and never the answer.
 */
async function loginRoles(handle: DatabaseHandle): Promise<string[]> {
  const result = await handle.db.execute<{ rolname: string }>(sql`
    select rolname::text as rolname from pg_catalog.pg_roles
    where rolcanlogin and rolname not like 'pg\_%' order by 1
  `);
  return rowsOf(result).map((row) => row.rolname);
}

interface AccessRow extends Record<string, unknown> {
  table_name: string;
  reachable: boolean;
}

/**
 * Prove the grant, instead of trusting that it took.
 *
 * `has_table_privilege` answers for ANY role, with no need to be a member of it or to hold the
 * password — so this checks the deployed app's access from the admin session, before anybody
 * redeploys. That is the difference between finding the rotating-admin trap here and finding it
 * in a crash loop at the start of an event.
 */
export async function verifyRuntimeAccess(
  handle: DatabaseHandle,
  role: string,
): Promise<AccessReport> {
  // `PUBLIC` is a pseudo-role: it has no pg_roles row, but has_*_privilege resolves it, and
  // every role inherits what it holds. So it verifies like any other grantee from here down.
  const name = isPublicRole(role) ? 'public' : role;
  const known = await handle.db.execute<{ present: boolean }>(
    sql`select ${isPublicRole(role)}::boolean
          or exists(select 1 from pg_catalog.pg_roles where rolname = ${role}) as present`,
  );
  if (!rowsOf(known)[0]?.present) {
    const candidates = await loginRoles(handle);
    return { role, exists: false, canUseSchema: false, tablesTotal: 0, unreachable: [], candidates };
  }
  const schema = await handle.db.execute<{ can_use: boolean }>(
    sql`select has_schema_privilege(${name}, 'public', 'USAGE') as can_use`,
  );
  const tables = await handle.db.execute<AccessRow>(sql`
    select c.relname::text as table_name,
           (has_table_privilege(${name}, c.oid, 'SELECT')
            and has_table_privilege(${name}, c.oid, 'INSERT')) as reachable
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by 1
  `);
  const rows = rowsOf(tables);
  return {
    role,
    exists: true,
    canUseSchema: rowsOf(schema)[0]?.can_use ?? false,
    tablesTotal: rows.length,
    unreachable: rows.filter((row) => !row.reachable).map((row) => row.table_name),
    candidates: [],
  };
}

/** The verdict in the terms that matter: will the app work, and if not, exactly what is missing. */
export function describeAccess(report: AccessReport): string {
  if (!report.exists) {
    const known = report.candidates.length > 0 ? report.candidates.join(', ') : '(none visible)';
    return [
      `No role named ${report.role} exists in this database.`,
      '',
      'A managed platform often authenticates one username and maps it onto another role, so',
      "the username in the app's connection string need not be the role to grant to. Roles that",
      `do exist here: ${known}`,
      '',
      "To see which one the app actually becomes, inspect using the APP's own string:",
      "  ./db-provision.sh 'postgresql://APP:...@host/db' --inspect",
    ].join('\n');
  }
  if (!report.canUseSchema) {
    return `${report.role} cannot even USAGE schema public; the app cannot read anything.`;
  }
  if (report.unreachable.length > 0) {
    const shown = report.unreachable.slice(0, 8).join(', ');
    const more = report.unreachable.length > 8 ? ', …' : '';
    return (
      `${report.role} is missing read/write on ${report.unreachable.length} of ` +
      `${report.tablesTotal} tables: ${shown}${more}`
    );
  }
  if (report.tablesTotal === 0) {
    // The trap this caught: a grant over an empty database succeeds, covers nothing, and a
    // report phrased as "all 0 tables" reads like a pass. It is the opposite of a pass.
    return (
      `${report.role} holds USAGE, but this database has NO TABLES — the schema was never ` +
      'provisioned. Re-run without --inspect to build it, then the grant will have something ' +
      'to cover.'
    );
  }
  return `${report.role} can read and write all ${report.tablesTotal} tables. The app will boot.`;
}

/** Who could the app be? Answered from the admin session, for when nobody can see its string. */
export interface RoleSurvey {
  /** Every role that can log in, PostgreSQL's own excluded. */
  logins: string[];
  /** Roles with a connection open to this database right now, other than ours. */
  connected: string[];
}

/**
 * Discover the app's role without ever seeing the app's connection string (ADR-178).
 *
 * A managed platform injects `DATABASE_URL` into the container as a hidden variable: the people
 * running the deployment genuinely cannot read it, so "take the username out of the app's string"
 * is not advice they can follow. The database knows anyway.
 *
 * `pg_stat_activity` is the sharp half. A crash-looping app reconnects every few seconds, so its
 * role shows up as a live backend — the role is observed rather than guessed. `usename` is
 * visible to ordinary roles even though other sessions' queries are not, so this needs no special
 * privilege. The login list is the fallback for when the app is stopped, or between its restarts.
 */
export async function surveyRoles(handle: DatabaseHandle): Promise<RoleSurvey> {
  const logins = await handle.db.execute<{ who: string }>(sql`
    select rolname::text as who from pg_catalog.pg_roles
    where rolcanlogin and rolname not like 'pg\_%' order by 1
  `);
  const connected = await handle.db.execute<{ who: string }>(sql`
    select distinct usename::text as who from pg_catalog.pg_stat_activity
    where datname = current_database() and usename is not null
      and usename <> current_user and pid <> pg_backend_pid()
    order by 1
  `);
  return {
    logins: rowsOf(logins).map((row) => row.who),
    connected: rowsOf(connected).map((row) => row.who),
  };
}

/** The survey as advice, because a list of role names is not yet an answer. */
export function describeRoles(survey: RoleSurvey, self: string): string {
  const others = survey.logins.filter((role) => role !== self);
  const lines = [
    `login roles here: ${survey.logins.length > 0 ? survey.logins.join(', ') : '(none visible)'}`,
  ];
  if (survey.connected.length > 0) {
    lines.push(
      `connected to this database right now: ${survey.connected.join(', ')}`,
      '  ^ a crash-looping app reconnects every few seconds, so this is very likely its role.',
    );
  } else {
    lines.push('nothing else is connected right now — start the app and re-run to catch its role.');
  }
  if (others.length === 1) {
    lines.push(`only one role here is not us: ${others[0]} — that is almost certainly the app.`);
  }
  return lines.join('\n');
}
