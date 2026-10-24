import { mkdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getEnv, resolveDriver } from '../env.js';
import { normaliseConnectionString, secretsFrom } from './connectionString.js';
import { guardPool } from './poolGuards.js';
import { poolOptionsFor } from './poolOptions.js';
import { PROVISION_LOCK_NAME, withAdvisoryLock } from './advisoryLock.js';
import * as schema from './schema/index.js';

/**
 * One schema, one repository layer, two drivers (ADR-003):
 *   - pglite   → real PostgreSQL compiled to WASM, in-process (dev + tests)
 *   - postgres → node-postgres against a deployed server
 * Both expose the identical Drizzle surface, so nothing above this file knows which is in use.
 */

export type AppDatabase = ReturnType<typeof drizzlePglite<typeof schema>>;
export type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];
export type Executor = AppDatabase | AppTransaction;

export interface DatabaseHandle {
  db: AppDatabase;
  runSql: (sql: string) => Promise<unknown>;
  /**
   * Run `work` while holding the cross-instance provisioning lock (ADR-250). On PGlite there is
   * exactly one process and one connection, so it is simply `work()`. Not re-entrant: a nested call
   * from the same handle waits on itself, and a CHILD PROCESS that also takes it deadlocks against
   * its parent, so a caller that spawns one must release first.
   */
  withProvisionLock: <T>(work: () => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

interface PgliteOptions {
  dataDir: string;
}

async function openPglite(options: PgliteOptions): Promise<DatabaseHandle> {
  const isMemory = options.dataDir === 'memory://' || options.dataDir === ':memory:';
  // PGlite's node filesystem creates the leaf directory only, so a nested default like
  // `.data/dev` fails on a fresh clone unless the parents already exist.
  if (!isMemory) await mkdir(options.dataDir, { recursive: true });
  const client = isMemory ? new PGlite() : new PGlite(options.dataDir);
  await client.waitReady;
  return {
    db: drizzlePglite(client, { schema }),
    runSql: (sql: string) => client.exec(sql),
    withProvisionLock: (work) => work(),
    close: () => client.close(),
  };
}

import { connectionName } from './poolOptions.js';
export { connectionName };

async function openNodePostgres(rawConnectionString: string): Promise<DatabaseHandle> {
  // ADR-251 — a multi-host URI (primary,replica) is what some platforms issue and `pg` cannot parse.
  const { url: connectionString, extraHosts } = normaliseConnectionString(rawConnectionString);
  if (extraHosts > 0) {
    console.log(
      `[db] connection string lists ${extraHosts + 1} hosts; using the first (the primary). ` +
        'The others are read replicas this app does not use.',
    );
  }
  const pool = new pg.Pool(poolOptionsFor(connectionString, getEnv()));
  guardPool(pool, (line) => console.error(line), secretsFrom(rawConnectionString));
  const db = drizzleNodePg(pool, { schema }) as unknown as AppDatabase;
  return {
    db,
    runSql: (sql: string) => runUnlimited(connectionString, sql),
    withProvisionLock: (work) => withPoolLock(pool, work),
    close: () => pool.end(),
  };
}

/**
 * ADR-324 — provisioning runs the whole schema file and, for the demo tier, an 11 MB seed, as
 * single statements. They must not be cut by the pool's `statement_timeout`, which exists to bound
 * a request; they get a connection of their own, with no deadline, closed afterwards.
 */
async function runUnlimited(connectionString: string, sql: string): Promise<unknown> {
  const client = new pg.Client({ connectionString, application_name: connectionName(), keepAlive: true });
  client.on('error', () => undefined);
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

/** One dedicated connection holds the lock for the whole of `work` (see advisoryLock.ts). */
async function withPoolLock<T>(pool: pg.Pool, work: () => Promise<T>): Promise<T> {
  const holder = await pool.connect();
  try {
    return await withAdvisoryLock(
      holder,
      { name: PROVISION_LOCK_NAME, reclaimStale: true, log: (line) => console.log(`[db] ${line}`) },
      work,
    );
  } finally {
    holder.release();
  }
}

export async function openDatabase(): Promise<DatabaseHandle> {
  const env = getEnv();
  if (resolveDriver(env) === 'postgres') {
    // `env.ts` already refused a postgres driver without a URL, so this is a type narrowing rather
    // than a real branch.
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required when DATABASE_DRIVER=postgres');
    return openNodePostgres(env.DATABASE_URL);
  }
  return openPglite({ dataDir: env.PGLITE_DATA_DIR });
}

/**
 * Open a database named on the command line rather than in the environment (ADR-178).
 *
 * `openDatabase()` deliberately reads one place — `env.ts` — because an app with two ways to
 * choose its database has a way to choose the wrong one. A CLI run by a person who types the
 * target as an argument is the exception, and it is kept to this one exported function so the
 * exception stays visible rather than becoming a second configuration path.
 */
export async function openDatabaseAt(connectionString: string): Promise<DatabaseHandle> {
  return openNodePostgres(connectionString);
}

/** Tests open their own isolated in-memory database (AGENTS-testing.md §2). */
export async function openInMemoryDatabase(): Promise<DatabaseHandle> {
  return openPglite({ dataDir: 'memory://' });
}
