/**
 * ADR-250 — one provisioner at a time, across every instance sharing a database.
 *
 * An orchestrator starts several copies of the app at once, and each one runs the schema, the
 * seed and (for DB_INIT=demo) the demo load on boot. Every step is idempotent on its own, but
 * "idempotent" is not "safe to interleave": two instances both see zero participants and both load
 * the demo day, or both run DDL against the same table. A Postgres advisory lock serialises them,
 * and the loser then finds the work done and does nothing.
 *
 * Transaction-level, on ONE dedicated connection (see `withAdvisoryLock` for why not session-level).
 * Polled with `pg_try_advisory_xact_lock` rather than blocking, so waiting has a deadline and a log line
 * instead of an instance that hangs silently behind a stuck peer.
 */

export const PROVISION_LOCK_NAME = 'psd-active-day:provision';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_MS = 500;
const NOTICE_EVERY_POLLS = 20;

/** The slice of `pg.Client` this needs, so the polling logic can be tested without a server. */
export interface LockClient {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface LockOptions {
  timeoutMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  /** End a holder that has been idle past `staleAfterSeconds` instead of waiting out its owner (ADR-254). */
  reclaimStale?: boolean;
  staleAfterSeconds?: number;
  /** How often a live holder proves it is alive; 0 turns the heartbeat off. */
  heartbeatMs?: number;
}

/**
 * ADR-254 — how long a holder may be idle before it is treated as dead. Only a holder with no
 * heartbeat can reach this: a live one touches its session every HEARTBEAT_MS, so it is never more
 * than a few seconds idle. 120 s is 24 missed heartbeats, far beyond a network blip.
 */
export const STALE_AFTER_SECONDS = 120;
const HEARTBEAT_MS = 5_000;

/** A session holding the lock, as Postgres describes it. Null where the role may not see it. */
export interface LockHolder {
  pid: number;
  application: string | null;
  state: string | null;
  idleSeconds: number | null;
  ageSeconds: number | null;
  client: string | null;
}

/*
 * `pg_locks` stores a bigint key as two halves: classid is the high 32 bits and objid the low 32,
 * both unsigned, with objsubid 1. hashtext() is an int4 that widens to a sign-extended bigint, so a
 * negative hash has a classid of 4294967295 — which is why this masks rather than shifts alone.
 * `pg_stat_activity` shows a role only its own sessions' details unless it holds pg_read_all_stats;
 * another role's row still has its pid, with the rest NULL, and the report says so.
 */
const HOLDER_QUERY = `
  with k as (select hashtext($1)::bigint as key)
  select a.pid::int as pid,
         a.application_name::text as application,
         a.state::text as state,
         extract(epoch from now() - a.state_change)::int as idle_s,
         extract(epoch from now() - a.backend_start)::int as age_s,
         a.client_addr::text as client
  from k, pg_catalog.pg_locks l
  join pg_catalog.pg_stat_activity a on a.pid = l.pid
  where l.locktype = 'advisory' and l.granted and l.objsubid = 1
    and l.database = (select oid from pg_catalog.pg_database where datname = current_database())
    and a.pid <> pg_backend_pid()
    and l.classid = ((k.key >> 32) & 4294967295)::oid
    and l.objid = (k.key & 4294967295)::oid`;

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const count = (value: unknown): number | null => (typeof value === 'number' ? value : null);

export async function findLockHolders(client: LockClient, name: string): Promise<LockHolder[]> {
  const result = await client.query(HOLDER_QUERY, [name]);
  return result.rows.map((row) => ({
    pid: Number(row['pid']),
    application: text(row['application']),
    state: text(row['state']),
    idleSeconds: count(row['idle_s']),
    ageSeconds: count(row['age_s']),
    client: text(row['client']),
  }));
}

function describeHolder(holder: LockHolder): string {
  const facts = [
    holder.application ? `app="${holder.application}"` : 'app unknown (this role cannot see that session)',
    holder.state ? `state=${holder.state}` : null,
    holder.idleSeconds === null ? null : `in this state for ${holder.idleSeconds}s`,
    holder.ageSeconds === null ? null : `connected for ${holder.ageSeconds}s`,
    holder.client ? `from ${holder.client}` : null,
  ].filter((fact) => fact !== null);
  return `held by backend pid ${holder.pid}: ${facts.join(', ')}`;
}

/**
 * What to tell an operator who is stuck behind the lock. The termination statement is offered, not
 * run: the holder may be a healthy provisioning that is simply slow, and ending it half-way is the
 * very thing the lock exists to prevent.
 */
export function describeHolders(holders: readonly LockHolder[]): string[] {
  if (holders.length === 0) {
    return ['no session holds it right now (it was released while we looked, or it is not visible to this role)'];
  }
  const lines = holders.map(describeHolder);
  const pids = holders.map((holder) => holder.pid).join(', ');
  lines.push(
    'If that session belongs to a process that no longer exists (a stranded lock: common behind a ' +
      'connection pooler, or after a container was killed without closing its connections), end it ' +
      `with: select pg_terminate_backend(${holders[0]?.pid}); [pids: ${pids}]. ` +
      'If it is a live provisioning, wait: it is doing the work this instance is waiting for.',
  );
  return lines;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const IDLE_STATES = new Set(['idle', 'idle in transaction', 'idle in transaction (aborted)']);

/** Idle for long enough, by the server's own clock, that nothing alive could still own it. */
export function isStale(holder: LockHolder, staleAfterSeconds: number): boolean {
  return (
    holder.state !== null &&
    IDLE_STATES.has(holder.state) &&
    holder.idleSeconds !== null &&
    holder.idleSeconds >= staleAfterSeconds
  );
}

/**
 * Ends one stale holder. The staleness is re-checked INSIDE the statement, against the same row,
 * so a holder that became active between our look and our kill — a slow start, a heartbeat that
 * finally landed — is left alone. Returns whether a backend was actually signalled; a role that may
 * not signal that session gets false (and a logged reason), never an exception that ends the wait.
 */
async function terminateIfStale(
  client: LockClient,
  holder: LockHolder,
  staleAfterSeconds: number,
): Promise<boolean> {
  const result = await client.query(
    `select pg_terminate_backend(pid) as ended from pg_catalog.pg_stat_activity
      where pid = $1 and state like 'idle%'
        and extract(epoch from now() - state_change) >= $2`,
    [holder.pid, staleAfterSeconds],
  );
  return result.rows[0]?.['ended'] === true;
}

async function reclaimOne(client: LockClient, holder: LockHolder, options: LockOptions): Promise<boolean> {
  const { staleAfterSeconds = STALE_AFTER_SECONDS, log } = options;
  try {
    if (!(await terminateIfStale(client, holder, staleAfterSeconds))) return false;
  } catch (error) {
    log?.(`could not end stale holder pid ${holder.pid}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
  log?.(
    `ended stale lock holder pid ${holder.pid} (app=${holder.application ?? '?'}, ${holder.state}, ` +
      `idle ${holder.idleSeconds}s with no heartbeat): its owner is gone`,
  );
  return true;
}

async function reclaimStaleHolders(
  client: LockClient,
  holders: readonly LockHolder[],
  options: LockOptions,
): Promise<number> {
  const { staleAfterSeconds = STALE_AFTER_SECONDS } = options;
  const stale = holders.filter((holder) => isStale(holder, staleAfterSeconds));
  const results = await Promise.all(stale.map((holder) => reclaimOne(client, holder, options)));
  return results.filter(Boolean).length;
}

async function lookUp(client: LockClient, name: string): Promise<{ holders: LockHolder[]; lines: string[] }> {
  try {
    const holders = await findLockHolders(client, name);
    return { holders, lines: describeHolders(holders) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { holders: [], lines: [`could not look up who holds it: ${reason}`] };
  }
}

/** The periodic look at who is in the way: say so, and end the ones whose owner is provably gone. */
async function reportAndReclaim(client: LockClient, name: string, options: LockOptions): Promise<boolean> {
  const { log } = options;
  const { holders, lines } = await lookUp(client, name);
  log?.(`waiting for another instance to finish provisioning (${name})`);
  for (const line of lines) log?.(`  ${line}`);
  return options.reclaimStale === true && (await reclaimStaleHolders(client, holders, options)) > 0;
}

export async function acquireAdvisoryLock(
  client: LockClient,
  name: string,
  options: LockOptions = {},
): Promise<void> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, pollMs = DEFAULT_POLL_MS, sleep = realSleep } = options;
  const maxPolls = Math.max(1, Math.ceil(timeoutMs / pollMs));
  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const result = await client.query('select pg_try_advisory_xact_lock(hashtext($1)) as locked', [name]);
    if (result.rows[0]?.['locked'] === true) return;
    // Try again at once if we freed it: the next poll would otherwise wait pollMs for nothing.
    const freedOne = poll % NOTICE_EVERY_POLLS === 1 && (await reportAndReclaim(client, name, options));
    if (!freedOne) await sleep(pollMs);
  }
  const holders = (await lookUp(client, name)).lines.map((line) => `  ${line}`);
  throw new Error(
    [
      `Gave up after ${Math.round(timeoutMs / 1000)}s waiting to provision (advisory lock "${name}").`,
      ...holders,
    ].join('\n'),
  );
}

/**
 * Longest a holder may sit "idle in transaction" before Postgres ends it. The holder is idle by
 * design while the work runs on OTHER connections, so this must outlast the longest legitimate
 * provisioning (the demo script has a 10-minute limit). It exists so that a holder whose process
 * vanished cannot keep the lock forever: the server itself reaps it.
 */
const HOLDER_IDLE_LIMIT = '15min';

/**
 * ADR-254 — proof of life. The holder is idle by design while the work runs on other connections,
 * so "idle" cannot tell a live holder from a dead one. A statement every few seconds can: it moves
 * the session's `state_change`, so only a holder whose process is gone ever looks stale. A failing
 * beat is logged and stops: it means the connection is gone, and with it the lock.
 */
function startHeartbeat(client: LockClient, lock: LockOptions): ReturnType<typeof setInterval> | undefined {
  const every = lock.heartbeatMs ?? HEARTBEAT_MS;
  if (every <= 0) return undefined;
  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    client.query('select 1').catch((error: unknown) => {
      clearInterval(timer);
      lock.log?.(`lock heartbeat failed, so the lock is lost: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, every);
  timer.unref();
  return timer;
}

/**
 * Runs `work` while holding the lock, for as long as one transaction on `client` lasts.
 *
 * Transaction-level, not session-level (ADR-253). A session lock is taken by one statement and
 * released by a later one, and anything between this process and Postgres that is allowed to hand
 * those two statements to different backends — a transaction-mode pooler, a failover proxy — takes
 * the lock on one and unlocks on the other, leaving it held by a session nobody owns, forever. A
 * transaction pins every statement inside it to one backend, so the lock is taken and released on
 * the same one by construction, and commit, rollback, a dropped connection and the idle limit above
 * all release it. There is no path that leaves it held.
 */
export async function withAdvisoryLock<T>(
  client: LockClient,
  lock: LockOptions & { name: string },
  work: () => Promise<T>,
): Promise<T> {
  await client.query('begin');
  let beat: ReturnType<typeof setInterval> | undefined;
  try {
    await client.query(`set local idle_in_transaction_session_timeout = '${HOLDER_IDLE_LIMIT}'`);
    await acquireAdvisoryLock(client, lock.name, lock);
    beat = startHeartbeat(client, lock);
    return await work();
  } finally {
    if (beat) clearInterval(beat);
    // Rollback, because there is nothing to keep, and it still releases the lock. A failure here
    // means the connection is already gone, which released the lock too; it must not hide `work`'s.
    await client.query('rollback').catch(() => undefined);
  }
}
