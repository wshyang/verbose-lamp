import { EventEmitter } from 'node:events';
import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardPool } from '../db/poolGuards.js';
import { runDetached } from '../lib/detached.js';
import { tickSchedule, resetTickGuardForTests } from '../routes-tournament/support.js';
import { createTestContext, type TestContext } from './harness.js';

/**
 * ADR-324 — one fault, one request. Each case below is a condition that used to end the whole
 * process: an EventEmitter 'error' with no listener (a pooled connection dropped by Postgres), a
 * detached promise rejecting (a database error inside a fire-and-forget stream write), and a
 * scheduler tick that piled up behind a hung database.
 */

describe('guardPool', () => {
  it('lets an idle pooled connection die without ending the process', () => {
    const pool = new pg.Pool({ connectionString: 'postgresql://u:p@127.0.0.1:1/none' });
    const log = vi.fn();
    guardPool(pool, log);
    // Unguarded, EventEmitter throws "Unhandled error" here — in production that is a socket
    // callback, i.e. an uncaught exception.
    expect(() => pool.emit('error', new Error('terminating connection'), {})).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('keeps a checked-out client from throwing when its backend dies mid-transaction', () => {
    const pool = new pg.Pool({ connectionString: 'postgresql://u:p@127.0.0.1:1/none' });
    const log = vi.fn();
    guardPool(pool, log);
    const client = new EventEmitter();
    pool.emit('connect', client);
    expect(() => client.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('redacts a connection string that an error message happens to contain', () => {
    const pool = new pg.Pool({ connectionString: 'postgresql://u:p@127.0.0.1:1/none' });
    const log = vi.fn();
    guardPool(pool, log, ['hunter2']);
    pool.emit('error', new Error('password hunter2 rejected'), {});
    expect(String(log.mock.calls[0]?.[0])).not.toContain('hunter2');
  });
});

describe('runDetached', () => {
  afterEach(() => vi.restoreAllMocks());

  it('routes a rejection to the handler instead of the process', async () => {
    const seen: unknown[] = [];
    const unhandled = vi.fn();
    process.once('unhandledRejection', unhandled);
    runDetached(Promise.reject(new Error('db down')), (error) => seen.push(error));
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off('unhandledRejection', unhandled);
    expect(seen).toHaveLength(1);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('survives a handler that itself throws', async () => {
    const unhandled = vi.fn();
    process.once('unhandledRejection', unhandled);
    runDetached(Promise.reject(new Error('x')), () => {
      throw new Error('handler bug');
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('does nothing for a promise that resolves', async () => {
    const handler = vi.fn();
    runDetached(Promise.resolve(1), handler);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('tickSchedule overlap', () => {
  let context: TestContext | null = null;
  afterEach(async () => {
    resetTickGuardForTests();
    await context?.close();
    context = null;
  });

  it('skips a tick while the previous one is still running', async () => {
    context = await createTestContext();
    const spy = vi.spyOn(context.handle.db, 'transaction').mockImplementation(
      () => new Promise(() => undefined) as never,
    );
    void tickSchedule(context.handle.db, new Date());
    await new Promise((resolve) => setTimeout(resolve, 20));
    const callsAfterFirst = spy.mock.calls.length;
    await tickSchedule(context.handle.db, new Date());
    await tickSchedule(context.handle.db, new Date());
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('poolOptionsFor', () => {
  it('carries every limit into the options pg.Pool receives', async () => {
    const { poolOptionsFor } = await import('../db/poolOptions.js');
    const options = poolOptionsFor('postgresql://u:p@h/db', {
      DATABASE_POOL_MAX: 12,
      DATABASE_CONNECT_TIMEOUT_MS: 4_000,
      DATABASE_STATEMENT_TIMEOUT_MS: 20_000,
      DATABASE_IDLE_TX_TIMEOUT_MS: 45_000,
    });
    expect(options).toMatchObject({
      max: 12,
      connectionTimeoutMillis: 4_000,
      statement_timeout: 20_000,
      query_timeout: 20_000,
      idle_in_transaction_session_timeout: 45_000,
    });
  });

  it('leaves the query timeouts off when they are 0, which Postgres reads as none', async () => {
    const { poolOptionsFor } = await import('../db/poolOptions.js');
    const options = poolOptionsFor('postgresql://u:p@h/db', {
      DATABASE_POOL_MAX: 10,
      DATABASE_CONNECT_TIMEOUT_MS: 10_000,
      DATABASE_STATEMENT_TIMEOUT_MS: 0,
      DATABASE_IDLE_TX_TIMEOUT_MS: 0,
    });
    expect(options.statement_timeout).toBeUndefined();
    expect(options.query_timeout).toBeUndefined();
    expect(options.idle_in_transaction_session_timeout).toBeUndefined();
  });

  it('keeps TCP keepalive on, so a connection a NAT forgot is noticed instead of hanging', async () => {
    const { poolOptionsFor } = await import('../db/poolOptions.js');
    const options = poolOptionsFor('postgresql://u:p@h/db', {
      DATABASE_POOL_MAX: 10,
      DATABASE_CONNECT_TIMEOUT_MS: 10_000,
      DATABASE_STATEMENT_TIMEOUT_MS: 30_000,
      DATABASE_IDLE_TX_TIMEOUT_MS: 60_000,
    });
    expect(options.keepAlive).toBe(true);
  });

  it('names the app in pg_stat_activity', async () => {
    const { poolOptionsFor } = await import('../db/poolOptions.js');
    const options = poolOptionsFor('postgresql://u:p@h/db', {
      DATABASE_POOL_MAX: 10,
      DATABASE_CONNECT_TIMEOUT_MS: 10_000,
      DATABASE_STATEMENT_TIMEOUT_MS: 30_000,
      DATABASE_IDLE_TX_TIMEOUT_MS: 60_000,
    });
    expect(options.application_name).toMatch(/^psd-active-day@/);
  });
});
