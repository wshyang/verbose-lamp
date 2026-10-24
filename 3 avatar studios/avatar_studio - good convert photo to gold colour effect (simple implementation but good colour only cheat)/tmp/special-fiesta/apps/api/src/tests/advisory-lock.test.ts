import { describe, expect, it, vi } from 'vitest';
import {
  PROVISION_LOCK_NAME,
  acquireAdvisoryLock,
  describeHolders,
  findLockHolders,
  isStale,
  withAdvisoryLock,
  type LockClient,
} from '../db/advisoryLock.js';
import { openInMemoryDatabase } from '../db/client.js';

/**
 * ADR-250 — the cross-instance provisioning lock. The polling logic is proven against a fake
 * connection; the Postgres behaviour it relies on (a session lock dies with its connection) is
 * Postgres's own, and the real-server run is the opt-in postgres-driver suite.
 */

function clientAnswering(...answers: boolean[]): LockClient & { calls: Array<[string, unknown[] | undefined]> } {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const queue = [...answers];
  return {
    calls,
    query: async (text, values) => {
      calls.push([text, values]);
      // The holder lookup is not a lock attempt and must not consume a scripted answer.
      if (text.includes('pg_stat_activity')) return { rows: [] };
      return { rows: [{ locked: queue.length > 0 ? queue.shift() : false }] };
    },
  };
}

describe('acquireAdvisoryLock', () => {
  it('returns at once when the lock is free', async () => {
    const client = clientAnswering(true);
    const sleep = vi.fn(async () => {});

    await acquireAdvisoryLock(client, PROVISION_LOCK_NAME, { sleep });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.[1]).toEqual([PROVISION_LOCK_NAME]);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('waits for the holder, announcing it once, and proceeds when the lock frees', async () => {
    const client = clientAnswering(false, false, true);
    const log = vi.fn();
    const sleep = vi.fn(async () => {});

    await acquireAdvisoryLock(client, PROVISION_LOCK_NAME, { sleep, log, pollMs: 10 });

    expect(sleep).toHaveBeenCalledTimes(2);
    // One notice, followed by the holder lookup's lines; not one notice per poll.
    const notices = log.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith('waiting for'));
    expect(notices).toHaveLength(1);
    expect(client.calls.filter(([text]) => text.includes('pg_stat_activity'))).toHaveLength(1);
  });

  it('gives up with a message naming the lock and how to find the holder', async () => {
    const client = clientAnswering();

    await expect(
      acquireAdvisoryLock(client, PROVISION_LOCK_NAME, {
        timeoutMs: 100,
        pollMs: 10,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/Gave up after 0s waiting to provision.*psd-active-day:provision/s);
    // 10 attempts; one lookup of who holds it at the first notice and one in the give-up error.
    expect(client.calls.filter(([text]) => text.includes('pg_try_advisory_xact_lock'))).toHaveLength(10);
    expect(client.calls.filter(([text]) => text.includes('pg_stat_activity'))).toHaveLength(2);
  });

});

/** A client that answers by statement, so the transaction wrapper's SQL can be asserted in order. */
function scripted(answers: Record<string, Array<Record<string, unknown>>> = {}) {
  const sent: string[] = [];
  const client: LockClient = {
    query: async (text) => {
      sent.push(text.trim().split('\n')[0] ?? '');
      const key = Object.keys(answers).find((fragment) => text.includes(fragment));
      return { rows: key ? (answers[key] ?? []) : [{ locked: true }] };
    },
  };
  return { client, sent };
}

describe('withAdvisoryLock', () => {
  const lock = { name: PROVISION_LOCK_NAME, sleep: async () => {} };

  it('holds the lock for exactly one transaction around the work, and rolls it back', async () => {
    const { client, sent } = scripted();

    const result = await withAdvisoryLock(client, lock, async () => {
      sent.push('WORK');
      return 42;
    });

    expect(result).toBe(42);
    expect(sent[0]).toBe('begin');
    expect(sent[1]).toMatch(/set local idle_in_transaction_session_timeout = '15min'/);
    expect(sent[2]).toContain('pg_try_advisory_xact_lock');
    expect(sent.slice(3)).toEqual(['WORK', 'rollback']);
  });

  it('rolls back, and surfaces the work\'s own error, when the work fails', async () => {
    const { client, sent } = scripted();

    await expect(
      withAdvisoryLock(client, lock, async () => {
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
    expect(sent.at(-1)).toBe('rollback');
  });

  it('does not let a failed rollback (a dead connection) hide the real error', async () => {
    const client: LockClient = {
      query: async (text) => {
        if (text === 'rollback') throw new Error('connection terminated');
        return { rows: [{ locked: true }] };
      },
    };

    await expect(
      withAdvisoryLock(client, lock, async () => {
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
  });

  it('never runs the work, and still rolls back, when the lock cannot be had', async () => {
    const { client, sent } = scripted({ pg_try_advisory_xact_lock: [{ locked: false }] });
    const work = vi.fn();

    await expect(
      withAdvisoryLock(client, { ...lock, timeoutMs: 20, pollMs: 10 }, work),
    ).rejects.toThrow(/Gave up/);
    expect(work).not.toHaveBeenCalled();
    expect(sent.at(-1)).toBe('rollback');
  });
});

describe('who holds the lock', () => {
  const holderRow = { pid: 4242, application: 'psd-active-day@old-container', state: 'idle in transaction', idle_s: 900, age_s: 1200, client: '10.0.0.7' };

  it('reads the holder from pg_locks and describes it, including how to end a stranded one', async () => {
    const { client } = scripted({ pg_stat_activity: [holderRow] });

    const holders = await findLockHolders(client, PROVISION_LOCK_NAME);
    const text = describeHolders(holders).join('\n');

    expect(holders[0]).toMatchObject({ pid: 4242, application: 'psd-active-day@old-container', idleSeconds: 900 });
    expect(text).toContain('held by backend pid 4242');
    expect(text).toContain('app="psd-active-day@old-container"');
    expect(text).toContain('idle in transaction');
    expect(text).toContain('select pg_terminate_backend(4242)');
  });

  it('says so when the holder is a session this role cannot see into', () => {
    const text = describeHolders([{ pid: 7, application: null, state: null, idleSeconds: null, ageSeconds: null, client: null }]).join('\n');

    expect(text).toContain('held by backend pid 7: app unknown (this role cannot see that session)');
  });

  it('says nobody holds it when the lookup finds nothing', () => {
    expect(describeHolders([]).join('')).toContain('no session holds it right now');
  });

  it('keeps waiting, with a note, when the lookup itself is refused', async () => {
    const log = vi.fn();
    const client: LockClient = {
      query: async (text) => {
        if (text.includes('pg_stat_activity')) throw new Error('permission denied for view pg_stat_activity');
        return { rows: [{ locked: false }] };
      },
    };

    await expect(
      acquireAdvisoryLock(client, PROVISION_LOCK_NAME, { timeoutMs: 20, pollMs: 10, sleep: async () => {}, log }),
    ).rejects.toThrow(/could not look up who holds it: permission denied/);
    expect(log.mock.calls.map(([line]) => String(line)).join('\n')).toContain('could not look up who holds it');
  });

  it('the pg_locks key arithmetic finds a real held lock, including a negative hash', async () => {
    const handle = await openInMemoryDatabase();
    try {
      const { sql } = await import('drizzle-orm');
      const name = PROVISION_LOCK_NAME;
      // 'psd-active-day:provision' hashes NEGATIVE, the case where a plain shift picks the wrong half.
      const [hash] = (await handle.db.execute(sql`select hashtext(${name}) as h`) as unknown as { rows: Array<{ h: number }> }).rows;
      expect(hash?.h).toBeLessThan(0);
      await handle.db.execute(sql`select pg_advisory_lock(hashtext(${name}))`);

      // The WHERE clause of the holder query, verbatim, against the real catalogue.
      const found = (await handle.db.execute(sql`
        with k as (select hashtext(${name})::bigint as key)
        select count(*)::int as n from k, pg_catalog.pg_locks l
        where l.locktype = 'advisory' and l.granted and l.objsubid = 1
          and l.classid = ((k.key >> 32) & 4294967295)::oid
          and l.objid = (k.key & 4294967295)::oid`)) as unknown as { rows: Array<{ n: number }> };

      expect(found.rows[0]?.n).toBe(1);
    } finally {
      await handle.close();
    }
  });
});

describe('withProvisionLock on the embedded driver', () => {
  it('just runs the work: one process, one connection, nothing to serialise', async () => {
    const handle = await openInMemoryDatabase();
    try {
      await expect(handle.withProvisionLock(async () => 'done')).resolves.toBe('done');
      await expect(
        handle.withProvisionLock(async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
    } finally {
      await handle.close();
    }
  });
});


/** A client whose answers depend on the statement, with the holder row configurable per test. */
function reclaimClient(holder: Record<string, unknown> | null, terminateEnds = true) {
  const sent: string[] = [];
  const client: LockClient = {
    query: async (text) => {
      sent.push(text);
      if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: false }] };
      if (text.includes('pg_terminate_backend')) return { rows: [{ ended: terminateEnds }] };
      if (text.includes('pg_stat_activity')) return { rows: holder ? [holder] : [] };
      return { rows: [] };
    },
  };
  return { client, sent };
}

const stale = { pid: 2860, application: 'psd-active-day@gone', state: 'idle in transaction', idle_s: 900, age_s: 1000, client: '10.0.0.7' };
const fast = { timeoutMs: 20, pollMs: 10, sleep: async () => {}, reclaimStale: true, staleAfterSeconds: 120 };

describe('reclaiming a stale holder (ADR-254)', () => {
  it('ends a holder idle past the limit, re-checking staleness inside the same statement', async () => {
    const { client, sent } = reclaimClient(stale);
    const log = vi.fn();

    await acquireAdvisoryLock(client, PROVISION_LOCK_NAME, { ...fast, log }).catch(() => undefined);

    const kill = sent.find((text) => text.includes('pg_terminate_backend')) ?? '';
    expect(kill).toContain("state like 'idle%'");
    expect(kill).toContain('state_change');
    expect(log.mock.calls.map(([line]) => String(line)).join('\n')).toContain('ended stale lock holder pid 2860');
  });

  it('leaves alone a holder that is active, or idle for less than the limit', async () => {
    for (const holder of [{ ...stale, state: 'active' }, { ...stale, idle_s: 10 }, { ...stale, state: null, idle_s: null }]) {
      const { client, sent } = reclaimClient(holder);

      await acquireAdvisoryLock(client, PROVISION_LOCK_NAME, fast).catch(() => undefined);

      expect(sent.some((text) => text.includes('pg_terminate_backend'))).toBe(false);
    }
  });

  it('does nothing unless asked to reclaim', async () => {
    const { client, sent } = reclaimClient(stale);

    await acquireAdvisoryLock(client, PROVISION_LOCK_NAME, { ...fast, reclaimStale: false }).catch(() => undefined);

    expect(sent.some((text) => text.includes('pg_terminate_backend'))).toBe(false);
  });

  it('reports, and keeps waiting, when the role may not end that session or the holder woke up', async () => {
    const log = vi.fn();
    const refused: LockClient = {
      query: async (text) => {
        if (text.includes('pg_terminate_backend')) throw new Error('must be a member of the role whose process is being terminated');
        if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: false }] };
        return { rows: [stale] };
      },
    };

    await expect(acquireAdvisoryLock(refused, PROVISION_LOCK_NAME, { ...fast, log })).rejects.toThrow(/Gave up/);
    expect(log.mock.calls.map(([line]) => String(line)).join('\n')).toContain('could not end stale holder pid 2860: must be a member');

    const woke = reclaimClient(stale, false);
    await expect(acquireAdvisoryLock(woke.client, PROVISION_LOCK_NAME, fast)).rejects.toThrow(/Gave up/);
  });

  it('takes the lock straight after freeing it, without waiting another poll', async () => {
    let freed = false;
    const sleep = vi.fn(async () => {});
    const client: LockClient = {
      query: async (text) => {
        if (text.includes('pg_terminate_backend')) {
          freed = true;
          return { rows: [{ ended: true }] };
        }
        if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: freed }] };
        return { rows: [stale] };
      },
    };

    await acquireAdvisoryLock(client, PROVISION_LOCK_NAME, { ...fast, sleep, timeoutMs: 10_000, pollMs: 500 });

    expect(sleep).not.toHaveBeenCalled();
  });

  it('isStale needs an idle state AND a long idle time', () => {
    const base = { pid: 1, application: null, client: null, ageSeconds: 5 };
    expect(isStale({ ...base, state: 'idle', idleSeconds: 120 }, 120)).toBe(true);
    expect(isStale({ ...base, state: 'idle in transaction (aborted)', idleSeconds: 500 }, 120)).toBe(true);
    expect(isStale({ ...base, state: 'idle', idleSeconds: 119 }, 120)).toBe(false);
    expect(isStale({ ...base, state: 'active', idleSeconds: 9999 }, 120)).toBe(false);
    expect(isStale({ ...base, state: 'idle', idleSeconds: null }, 120)).toBe(false);
  });
});

describe('the holder heartbeat (ADR-254)', () => {
  it('pings the connection while the work runs, so a live holder is never idle long, and stops after', async () => {
    vi.useFakeTimers();
    try {
      const pings: string[] = [];
      const client: LockClient = {
        query: async (text) => {
          pings.push(text);
          return { rows: [{ locked: true }] };
        },
      };

      const done = withAdvisoryLock(client, { name: PROVISION_LOCK_NAME, heartbeatMs: 1000 }, async () => {
        await vi.advanceTimersByTimeAsync(3500);
        return 'ok';
      });
      await expect(done).resolves.toBe('ok');
      const beats = pings.filter((text) => text === 'select 1').length;
      await vi.advanceTimersByTimeAsync(5000);

      expect(beats).toBe(3);
      expect(pings.filter((text) => text === 'select 1')).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops beating and says the lock is lost when the connection dies', async () => {
    vi.useFakeTimers();
    try {
      const log = vi.fn();
      let dead = false;
      const client: LockClient = {
        query: async (text) => {
          if (text === 'select 1' && dead) throw new Error('Connection terminated');
          return { rows: [{ locked: true }] };
        },
      };

      await withAdvisoryLock(client, { name: PROVISION_LOCK_NAME, heartbeatMs: 1000, log }, async () => {
        dead = true;
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(log.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('heartbeat failed'))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('can be turned off', async () => {
    vi.useFakeTimers();
    try {
      const pings: string[] = [];
      const client: LockClient = { query: async (text) => (pings.push(text), { rows: [{ locked: true }] }) };

      await withAdvisoryLock(client, { name: PROVISION_LOCK_NAME, heartbeatMs: 0 }, async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(pings.filter((text) => text === 'select 1')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
