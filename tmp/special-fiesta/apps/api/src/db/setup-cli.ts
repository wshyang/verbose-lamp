import { openDatabase, openDatabaseAt, type DatabaseHandle } from './client.js';
import {
  applyDemoSeed,
  ensureDemoData,
  ensureSchema,
  readSchemaVersion,
  resetSchema,
  schemaStatus,
  type SchemaOutcome,
} from './bootstrap.js';
import { seedDatabase } from './seed.js';
import {
  PROVISION_LOCK_NAME,
  describeHolders,
  findLockHolders,
  type LockClient,
} from './advisoryLock.js';
import { waitForDatabase } from './connectivity.js';
import {
  connectionStringsIn,
  diagnoseConnectionString,
  secretsFrom,
} from './connectionString.js';
import { describeFailure } from './failureHints.js';
import {
  describeIdentity,
  describeTarget,
  grantRuntimeAccess,
  inspectDatabase,
  describeAccess,
  describeRoles,
  missingDdlAdvice,
  parseProvisionArgs,
  roleNameFrom,
  surveyRoles,
  verifyRuntimeAccess,
  type ProvisionOptions,
} from './provision.js';

/**
 * Provisions a database without starting the server: `npm run db:setup` (ADR-049, ADR-178).
 *
 * The app does this on boot anyway, so this exists for the cases where booting is the wrong tool —
 * preparing a fresh Postgres container in CI, checking that a `DATABASE_URL` someone just handed
 * you is reachable and writable before trusting it to run an event, and the case that gave this
 * file its arguments: a MANAGED database whose application role is not allowed to run DDL, which
 * must therefore be built from somewhere that holds an admin credential.
 *
 * Usage:
 *   npm run db:setup                                  # DATABASE_URL from the environment
 *   ./db-provision.sh 'postgresql://…'                # a target named on the command line
 *   ./db-provision.sh 'postgresql://…' --demo         # …and load the recorded demo day
 *   ./db-provision.sh 'postgresql://…' --grant-to app # …and let the runtime role in
 *   ./db-provision.sh 'postgresql://…' --inspect      # report privileges, write nothing
 *
 * Replaces `npm run migrate`, which no longer means anything now that there is one schema file
 * rather than a chain of steps.
 */

const OUTCOME_LINES: Record<SchemaOutcome, string> = {
  provisioned: 'empty database: applied schema.sql',
  repaired: 'database was missing part of schema.sql (older snapshot?): applied it',
  unchanged: 'schema already present: nothing to apply',
  verified: 'schema verified: this role cannot alter the tables (no DDL, or it does not own them), and did not need to',
};

async function openTarget(url: string | null): Promise<DatabaseHandle> {
  if (url) {
    const problem = diagnoseConnectionString(url);
    if (problem) throw new Error(`the connection string ${problem}`);
    console.log(`target: ${describeTarget(url)}`);
    await waitForDatabase(url);
    return openDatabaseAt(url);
  }
  return openDatabase();
}

/** Report and stop. The point is to answer "will the app boot against this?" before deploying. */
async function runInspection(handle: DatabaseHandle, options: ProvisionOptions): Promise<void> {
  const identity = await inspectDatabase(handle);
  console.log(describeIdentity(identity));
  const status = await schemaStatus(handle);
  console.log(
    status.missing.length === 0
      ? `schema: all ${status.expected} tables present`
      : `schema: ${status.expected - status.missing.length} of ${status.expected} tables present` +
        ` — NOT fully provisioned (missing ${status.missing.slice(0, 5).join(', ')}` +
        `${status.missing.length > 5 ? ', …' : ''})`,
  );
  if (identity.canCreatePublic) {
    console.log('This role can provision the schema itself; the app will boot and self-provision.');
  } else {
    console.log('');
    console.log(missingDdlAdvice(identity));
  }
  if (!options.grantTo) {
    // Nobody named a runtime role, which on a managed platform usually means nobody CAN — the
    // app's connection string is injected as a hidden variable. So offer what the database knows.
    console.log('');
    console.log(describeRoles(await surveyRoles(handle), identity.role));
  }
  await reportRuntimeAccess(handle, options.grantTo);
  await reportProvisionLock(handle);
}

/** Read-only: looks at the lock, never takes it, so inspecting cannot cause the stall it diagnoses. */
async function reportProvisionLock(handle: DatabaseHandle): Promise<void> {
  const holders = await findLockHolders(handle.db.$client as LockClient, PROVISION_LOCK_NAME).catch(
    () => null,
  );
  console.log('');
  if (holders === null) console.log('provisioning lock: could not be inspected by this role');
  else if (holders.length === 0) console.log('provisioning lock: free');
  else console.log(['provisioning lock: HELD', ...describeHolders(holders)].join('\n  '));
}

/**
 * The second question, and the one a rotating just-in-time admin makes essential: never mind this
 * session, can the role the APP uses still reach everything? Answered from here because
 * `has_table_privilege` works for any role without its password.
 */
async function reportRuntimeAccess(handle: DatabaseHandle, target: string | null): Promise<void> {
  if (!target) return;
  const report = await verifyRuntimeAccess(handle, roleNameFrom(target));
  console.log(describeAccess(report));
  // A gap here is the whole failure mode, so it must not exit 0 into a CI step that believes it.
  if (!report.exists || !report.canUseSchema || report.unreachable.length > 0) {
    process.exitCode = 1;
  }
}

/**
 * ADR-264 — empty the database for a rebuild: drop what the snapshot defines, report
 * what went, and stop. Provisioning is deliberately NOT this run's second act — the
 * caller (an operator, or DB_INIT right behind us) asks for that separately, so a
 * reset can be inspected before anything is rebuilt over the empty ground.
 */
async function runReset(handle: DatabaseHandle): Promise<void> {
  console.log(describeIdentity(await inspectDatabase(handle)));
  const version = await readSchemaVersion(handle);
  const dropped = await resetSchema(handle);
  console.log(
    dropped.length === 0
      ? 'reset: no snapshot tables present; nothing dropped'
      : `reset: dropped ${dropped.length} tables (schema was stamped version ${version}); ` +
        'the database is empty of this app — provision to rebuild',
  );
}

async function runProvision(handle: DatabaseHandle, options: ProvisionOptions): Promise<void> {
  console.log(describeIdentity(await inspectDatabase(handle)));
  console.log(OUTCOME_LINES[await ensureSchema(handle)]);
  await seedDatabase(handle);
  console.log('default seed applied (clusters, titles, the initial accounts)');
  // Ordered after the seed because the demo day references the accounts the seed creates.
  const demoed = options.demo ? await applyDemoSeed(handle) : await ensureDemoData(handle);
  if (demoed) console.log('applied seed-demo.sql: the recorded demo day');
  else if (options.demo) console.log('--demo ignored: this database already has participants');
  /*
   * Last, and deliberately so: the grant covers ALL TABLES IN SCHEMA public, which only means
   * anything once the tables exist. Running it before the schema would silently grant nothing.
   */
  if (options.grantTo) {
    const role = roleNameFrom(options.grantTo);
    await grantRuntimeAccess(handle, role);
    console.log(`granted ${role} read/write on what was built`);
    await reportRuntimeAccess(handle, role);
  }
}

async function main(): Promise<void> {
  const options = parseProvisionArgs(process.argv.slice(2));
  const handle = await openTarget(options.url);
  try {
    if (options.inspectOnly) await runInspection(handle, options);
    else if (options.resetOnly) await handle.withProvisionLock(() => runReset(handle));
    // ADR-250 — an operator's run and a booting instance must not interleave either.
    else await handle.withProvisionLock(() => runProvision(handle, options));
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  // The report, not the object: these failures are operator-facing and several of them are
  // multi-line instructions. A stack trace above them buries the part that matters. Redacted
  // against the URLs on the command line, since an error message is where a password leaks.
  const secrets = connectionStringsIn(process.argv.slice(2)).flatMap(secretsFrom);
  console.error('\ndatabase setup failed\n');
  console.error(describeFailure(error, secrets));
  process.exitCode = 1;
});
