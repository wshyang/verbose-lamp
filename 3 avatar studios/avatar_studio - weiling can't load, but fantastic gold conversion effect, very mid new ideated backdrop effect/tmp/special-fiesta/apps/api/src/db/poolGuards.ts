import type { EventEmitter } from 'node:events';
import type pg from 'pg';
import { redact } from './connectionString.js';

/**
 * ADR-324 — a database connection that dies must cost the request that was using it, never the
 * process. `pg` reports a lost connection by *emitting* `'error'`, and an EventEmitter with no
 * listener turns that into an uncaught exception. Two emitters are involved:
 *
 *   - the pool, for a connection that is idle when its server end goes away (a Postgres restart,
 *     a failover, a NAT that forgot the socket);
 *   - the client itself, for one that is checked out — which is every `db.transaction`, because
 *     pg-pool detaches its own idle listener at checkout.
 *
 * Listening on the pool's `'connect'` gives every client a permanent listener from birth, which
 * covers both. The failed query itself still rejects to its caller; this only stops the emit.
 */
export function guardPool(pool: pg.Pool, log: (line: string) => void, secrets: readonly string[] = []): void {
  const report = (where: string) => (error: Error) => {
    log(`[db] ${where} error (the request using it fails; the process stays up): ${redact(error.message, secrets)}`);
  };
  pool.on('error', report('pooled connection'));
  pool.on('connect', (client: EventEmitter) => {
    client.on('error', report('checked-out connection'));
  });
}
