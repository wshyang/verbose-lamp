import type pg from 'pg';
import { hostname } from 'node:os';
import type { AppEnv } from '../env.js';

/**
 * ADR-324 — the pool's limits, in one pure function so a test can read them without a server.
 *
 * `pg`'s defaults are "wait forever" in four places: nobody times out connecting, a query has no
 * deadline, a transaction may sit idle indefinitely, and a TCP connection a NAT has silently
 * forgotten is never noticed. With ten connections that means one stalled database parks every
 * connection and every later request queues behind them — the app is up, `/api/health` is fine,
 * and nothing answers. Each limit below turns one of those into an error for one request.
 *
 * `statement_timeout` is the server's own, `query_timeout` is the client's: the first cannot help
 * when the network is the thing that stalled, so both are set. For the two server-side limits 0
 * means "none" in Postgres, so 0 is passed as absent rather than as a value.
 */

type PoolLimits = Pick<
  AppEnv,
  'DATABASE_POOL_MAX' | 'DATABASE_CONNECT_TIMEOUT_MS' | 'DATABASE_STATEMENT_TIMEOUT_MS' | 'DATABASE_IDLE_TX_TIMEOUT_MS'
>;

/** What this process calls itself in `pg_stat_activity`, so a lock held by a stranger is recognisable. */
export function connectionName(): string {
  return `psd-active-day@${hostname()}`.slice(0, 63);
}

export function poolOptionsFor(connectionString: string, limits: PoolLimits): pg.PoolConfig {
  const statement = limits.DATABASE_STATEMENT_TIMEOUT_MS;
  const idleTx = limits.DATABASE_IDLE_TX_TIMEOUT_MS;
  return {
    connectionString,
    application_name: connectionName(),
    max: limits.DATABASE_POOL_MAX,
    connectionTimeoutMillis: limits.DATABASE_CONNECT_TIMEOUT_MS,
    keepAlive: true,
    ...(statement > 0 ? { statement_timeout: statement, query_timeout: statement } : {}),
    ...(idleTx > 0 ? { idle_in_transaction_session_timeout: idleTx } : {}),
  };
}
