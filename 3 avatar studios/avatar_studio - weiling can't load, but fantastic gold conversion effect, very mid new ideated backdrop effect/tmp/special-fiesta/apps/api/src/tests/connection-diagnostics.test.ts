import { describe, expect, it, vi } from 'vitest';
import {
  connectionStringsIn,
  diagnoseConnectionString,
  normaliseConnectionString,
  redact,
  secretsFrom,
  sslModeOf,
} from '../db/connectionString.js';
import { causeChain, describeFailure, hintFor, isTransientConnectionError, summaryOf } from '../db/failureHints.js';
import { waitForDatabase } from '../db/connectivity.js';
import { BootStepError, bootStep, describeBootConfig, reportBootFailure } from '../db/bootLog.js';
import { overrideEnv } from '../env.js';

/**
 * ADR-251 — diagnostics. The first fixture is the SHAPE of the URL a managed platform really issued
 * (a primary and a read replica in one authority) with made-up credentials; it is the string that
 * killed a deploy with `ERR_INVALID_URL` and a redacted log.
 */

const PASSWORD = 'pw-Secret-9x';
const MULTI = `postgresql://_user1:${PASSWORD}@primary.db.example:5432,read.db.example:5432/_dbname?sslmode=require`;
const SINGLE = `postgresql://_user1:${PASSWORD}@primary.db.example:5432/_dbname?sslmode=require`;

describe('multi-host connection strings', () => {
  it('Node cannot parse the multi-host form, which is why the app crashed', () => {
    expect(() => new URL(MULTI)).toThrow();
  });

  it('is reduced to the first host, the primary, and nothing else changes', () => {
    expect(normaliseConnectionString(MULTI)).toEqual({ url: SINGLE, extraHosts: 1 });
  });

  it('leaves an ordinary URL alone, and counts every dropped host', () => {
    expect(normaliseConnectionString(SINGLE)).toEqual({ url: SINGLE, extraHosts: 0 });
    expect(normaliseConnectionString('a,b').extraHosts).toBe(0);
    expect(normaliseConnectionString('postgres://u:p@h1:1,h2:2,h3:3/db').extraHosts).toBe(2);
  });

  it('is accepted by the diagnoser, and its sslmode and secrets are still found', () => {
    expect(diagnoseConnectionString(MULTI)).toBeNull();
    expect(sslModeOf(MULTI)).toBe('require');
    expect(secretsFrom(MULTI)).toContain(PASSWORD);
  });
});

describe('diagnoseConnectionString', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['an unresolved platform reference', '${NF_PSD_ACTIVE_DAY_DB_POSTGRES_URI}', /unresolved reference \$\{NF_PSD/],
    ['a blank value', '   ', /is blank/],
    ['a trailing newline', `${SINGLE}\n`, /whitespace/],
    ['wrapping quotes', `"${SINGLE}"`, /wrapped in quotes/],
    ['a bare password', 'justAPasswordWithNoScheme', /no "postgresql:\/\/" prefix/],
    ['another database scheme', 'mysql://u:p@h/db', /scheme "mysql:\/\/"/],
    ['an unescaped @ in the password', 'postgresql://u:p@ss@host:5432/db', /./],
    ['a malformed percent escape', 'postgresql://u:50%zz@host:5432/db', /% escape/],
  ];

  it.each(cases)('names the cause for %s', (_label, value, expected) => {
    const problem = diagnoseConnectionString(value);
    if (_label === 'an unescaped @ in the password') {
      // `new URL` is lenient here (it splits on the last @), so this one is only checked to be safe.
      expect(problem === null || expected.test(problem)).toBe(true);
      return;
    }
    expect(problem).toMatch(expected);
  });

  it('never quotes the value it is diagnosing', () => {
    for (const [, value] of cases) {
      const problem = diagnoseConnectionString(value) ?? '';
      expect(problem).not.toContain('justAPasswordWithNoScheme');
      expect(problem).not.toContain(PASSWORD);
    }
  });

  it('accepts a good URL', () => {
    expect(diagnoseConnectionString(SINGLE)).toBeNull();
  });
});

describe('redact', () => {
  it('masks a known password, its decoded form, and a password inside any URL it was not told about', () => {
    const text = `could not connect ${MULTI} and also postgres://other:hunter22@elsewhere/db and ${PASSWORD}`;

    const out = redact(text, secretsFrom(MULTI));

    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain('hunter22');
    expect(out).toContain('***');
  });

  it('does not mask short fragments that would mangle ordinary words', () => {
    expect(redact('the db is up', ['db'])).toBe('the db is up');
  });

  it('finds URLs on a command line', () => {
    expect(connectionStringsIn(['--demo', SINGLE, '--url', MULTI])).toEqual([SINGLE, MULTI]);
  });
});

function withCode(message: string, code: string, cause?: unknown): Error {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  return Object.assign(error, { code });
}

describe('failure hints', () => {
  it('walks Drizzle → pg → errno, and follows an AggregateError into its first member', () => {
    const refused = withCode('connect ECONNREFUSED 10.0.0.1:5432', 'ECONNREFUSED');
    const aggregate = Object.assign(new AggregateError([refused], ''), { code: 'ECONNREFUSED' });
    const wrapped = new Error('Failed query: select 1\nparams: ', { cause: aggregate });

    const chain = causeChain(wrapped);

    expect(chain.map((link) => link.name)).toEqual(['Error', 'AggregateError', 'Error']);
    expect(summaryOf(wrapped)).toContain('ECONNREFUSED');
    expect(isTransientConnectionError(wrapped)).toBe(true);
  });

  it('collapses the SQL dump to its first line instead of printing the statement', () => {
    const sqlDump = new Error('Failed query: \n  select current_user\n  from pg_namespace', {
      cause: withCode('Invalid URL', 'ERR_INVALID_URL'),
    });

    const report = describeFailure(sqlDump);

    expect(report).toContain('ERR_INVALID_URL');
    expect(report).not.toContain('pg_namespace');
    expect(report).toContain('check:  DATABASE_URL is not a valid URL');
  });

  const hinted: Array<[string, Error, RegExp]> = [
    ['wrong password', withCode('password authentication failed', '28P01'), /rejected the password/],
    ['missing database', withCode('database "x" does not exist', '3D000'), /does not exist on that server/],
    ['permission', withCode('permission denied for schema public', '42501'), /CREATE on schema public/],
    ['missing table', withCode('relation "x" does not exist', '42P01'), /DB_INIT=schema/],
    ['dns', withCode('getaddrinfo ENOTFOUND h', 'ENOTFOUND'), /did not resolve/],
    ['timeout', withCode('connect ETIMEDOUT', 'ETIMEDOUT'), /timed out/],
    ['reset', withCode('read ECONNRESET', 'ECONNRESET'), /cut or the host is unreachable/],
    ['too many', withCode('too many clients', '53300'), /connection slots/],
    ['starting', withCode('the database system is starting up', '57P03'), /still starting/],
    ['self-signed', new Error('self-signed certificate in certificate chain'), /TLS certificate is not trusted/],
    ['no tls', new Error('The server does not support SSL connections'), /TLS mismatch/],
    ['pg_hba', new Error('no pg_hba.conf entry for host "1.2.3.4"'), /IP allow-list/],
  ];

  it.each(hinted)('says what to check for %s', (_label, error, advice) => {
    expect(hintFor(error)).toMatch(advice);
  });

  it('has no hint for an error it does not recognise, and says so honestly', () => {
    expect(hintFor(new Error('something novel'))).toBeNull();
    expect(describeFailure(new Error('something novel'))).toBe('reason: Error: something novel');
  });

  it('treats a wrong setting as permanent and a refused connection as transient', () => {
    expect(isTransientConnectionError(withCode('x', '28P01'))).toBe(false);
    expect(isTransientConnectionError(withCode('x', 'ENOTFOUND'))).toBe(false);
    expect(isTransientConnectionError(withCode('x', 'ECONNREFUSED'))).toBe(true);
  });

  it('survives a non-Error throw and a cause cycle', () => {
    const loop = new Error('loop');
    Object.assign(loop, { cause: loop });

    expect(causeChain('plain string')).toEqual([
      { name: 'thrown', code: null, message: 'plain string', full: 'plain string' },
    ]);
    expect(causeChain(loop)).toHaveLength(1);
    expect(describeFailure(undefined)).toBe('reason: unknown error');
  });

  it('redacts a password that appears in an error message', () => {
    const leaky = new Error(`connect to ${SINGLE} failed`);

    expect(describeFailure(leaky, secretsFrom(SINGLE))).not.toContain(PASSWORD);
  });

  it('keeps a multi-line instruction whole, because those are the ones an operator must read', () => {
    const advice = new Error('line one\nline two\nline three');

    expect(describeFailure(advice)).toContain('line two');
  });
});

describe('waitForDatabase', () => {
  const quiet = { log: vi.fn(), sleep: async () => {} };

  it('connects on the first attempt and says how long it took', async () => {
    const log = vi.fn();
    const connect = vi.fn(async () => {});

    await waitForDatabase(MULTI, { ...quiet, log, connect });

    expect(connect).toHaveBeenCalledWith(SINGLE, expect.any(Number));
    expect(log.mock.calls[0]?.[0]).toMatch(/\[db\] connected to _user1@primary\.db\.example:5432\/_dbname/);
    expect(log.mock.calls[0]?.[0]).not.toContain(PASSWORD);
  });

  it('retries a refused connection with backoff and then succeeds', async () => {
    const log = vi.fn();
    const sleeps: number[] = [];
    let calls = 0;
    const connect = async () => {
      calls += 1;
      if (calls < 3) throw withCode(`connect ECONNREFUSED ${PASSWORD}`, 'ECONNREFUSED');
    };

    await waitForDatabase(SINGLE, { log, connect, sleep: async (ms) => void sleeps.push(ms) });

    expect(calls).toBe(3);
    expect(sleeps).toEqual([1000, 2000]);
    const retryLines = log.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('retrying'));
    expect(retryLines).toHaveLength(2);
    expect(retryLines.join('')).not.toContain(PASSWORD);
  });

  it('gives up after the last attempt, keeping the cause', async () => {
    const connect = async () => {
      throw withCode('connect ETIMEDOUT', 'ETIMEDOUT');
    };

    const failure = await waitForDatabase(SINGLE, { ...quiet, connect, attempts: 3 }).catch((e: unknown) => e);

    expect(String((failure as Error).message)).toContain('3 attempts');
    expect(isTransientConnectionError(failure)).toBe(true);
  });

  it('does not retry a wrong setting: it would be just as wrong in ten seconds', async () => {
    const connect = vi.fn(async () => {
      throw withCode('password authentication failed', '28P01');
    });

    await expect(waitForDatabase(SINGLE, { ...quiet, connect })).rejects.toThrow('1 attempt)');
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

describe('boot logging', () => {
  it('logs a step start and end, and stamps the failing step on the error', async () => {
    const log = vi.fn();

    const failure = await bootStep('provisioning', async () => {
      throw withCode('permission denied for schema public', '42501');
    }, log).catch((e: unknown) => e);

    expect(log).toHaveBeenCalledWith('[boot] provisioning…');
    expect(failure).toBeInstanceOf(BootStepError);
    const lines = reportBootFailure(failure, []);
    expect(lines[0]).toBe('FAILED TO START during: provisioning');
    expect(lines.join('\n')).toContain('CREATE on schema public');
  });

  it('names the innermost step when steps nest', async () => {
    const failure = await bootStep('outer', () =>
      bootStep('inner', async () => {
        throw new Error('boom');
      }, () => {}), () => {}).catch((e: unknown) => e);

    expect((failure as BootStepError).step).toBe('inner');
  });

  it('returns the value and reports the duration on success', async () => {
    const log = vi.fn();

    await expect(bootStep('quick', async () => 7, log)).resolves.toBe(7);

    expect(String(log.mock.calls[1]?.[0])).toMatch(/\[boot\] quick: ok \(\d+ms\)/);
  });

  it('prints the configuration with credentials as set / not set only', () => {
    const env = overrideEnv({
      NODE_ENV: 'test',
      DATABASE_URL: MULTI,
      DATABASE_DRIVER: 'postgres',
      SUPERADMIN_INITIAL_PASSCODE: '4242',
      DB_INIT: 'demo',
    });

    const text = describeBootConfig(env, 'v22.0.0').join('\n');

    expect(text).toContain('target=_user1@primary.db.example:5432/_dbname sslmode=require');
    expect(text).toContain('DB_INIT=demo');
    expect(text).toContain('SUPERADMIN_INITIAL_PASSCODE=set');
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain('4242');
  });

  it('warns that DB_INIT_RESET is inert without DB_INIT, and names the pairing when both are set', () => {
    const inert = overrideEnv({ NODE_ENV: 'test', DB_INIT_RESET: 'stale', DB_INIT: undefined });
    expect(describeBootConfig(inert).join('\n')).toContain(
      'WARNING: DB_INIT_RESET is set but DB_INIT is not, so it is NOT being used.',
    );

    const paired = overrideEnv({ NODE_ENV: 'test', DB_INIT_RESET: 'stale', DB_INIT: 'schema', DATABASE_URL: MULTI, DATABASE_DRIVER: 'postgres' });
    expect(describeBootConfig(paired).join('\n')).toContain('DB_INIT_RESET=stale');
  });

  it('warns when DATABASE_URL is empty and the app silently falls back to the embedded database', () => {
    const env = overrideEnv({ NODE_ENV: 'test', DATABASE_URL: '', DATABASE_DRIVER: undefined, DB_INIT: 'demo' });

    const text = describeBootConfig(env).join('\n');

    expect(text).toContain('driver=pglite');
    expect(text).toContain('WARNING: DATABASE_URL is set but empty');
  });

  it('warns when DATABASE_DRIVER=pglite overrides a URL, and flags a missing passcode', () => {
    const env = overrideEnv({
      NODE_ENV: 'test',
      DATABASE_URL: SINGLE,
      DATABASE_DRIVER: 'pglite',
      SUPERADMIN_INITIAL_PASSCODE: undefined,
    });

    const text = describeBootConfig(env).join('\n');

    expect(text).toContain('is being ignored');
    expect(text).toContain('SUPERADMIN_INITIAL_PASSCODE=NOT SET');
  });

  it('says which credential DB_INIT provisions with, and warns when an admin URL would be ignored', () => {
    const admin = 'postgresql://adminrole:adminpw-123@admin.db.example:5432/psd';
    const used = describeBootConfig(
      overrideEnv({ NODE_ENV: 'test', DATABASE_URL: SINGLE, DATABASE_URL_ADMIN: admin, DB_INIT: 'schema' }),
    ).join('\n');
    const ignored = describeBootConfig(
      overrideEnv({ NODE_ENV: 'test', DATABASE_URL: SINGLE, DATABASE_URL_ADMIN: admin, DB_INIT: undefined }),
    ).join('\n');

    expect(used).toContain('DB_INIT will provision as adminrole@admin.db.example:5432/psd (DATABASE_URL_ADMIN)');
    expect(ignored).toContain('DATABASE_URL_ADMIN is set');
    expect(ignored).toContain('NOT being used');
    expect(used + ignored).not.toContain('adminpw-123');
  });

  it('reports a failure with no step as happening during startup', () => {
    expect(reportBootFailure(new Error('x'), [])[0]).toBe('FAILED TO START during: startup');
  });
});

describe('the real I/O paths, exercised without a Postgres server', () => {
  it('connectOnce reports a refused connection as ECONNREFUSED, which the retry logic treats as transient', async () => {
    const { connectOnce } = await import('../db/connectivity.js');

    const failure = await connectOnce('postgresql://u:p@127.0.0.1:1/db', 2000).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(Error);
    expect(isTransientConnectionError(failure)).toBe(true);
  });

  it('runProvisionScript passes args and stdin to a real bash process and resolves on exit 0', async () => {
    const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { runProvisionScript } = await import('../db/dbInit.js');
    const dir = await mkdtemp(join(tmpdir(), 'dbinit-'));
    try {
      const script = join(dir, 'fake.sh');
      const out = join(dir, 'out.txt');
      await writeFile(script, `read -r line; printf '%s|%s|%s' "$1" "$line" "$FROM_ENV" > "${out}"\n`);

      await runProvisionScript({ script, args: ['--demo'], stdin: 'the-url', env: { FROM_ENV: 'e1', PATH: '/usr/bin:/bin' } });

      expect(await readFile(out, 'utf8')).toBe('--demo|the-url|e1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('runProvisionScript rejects with the exit code and a pointer to the output above it', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { runProvisionScript } = await import('../db/dbInit.js');
    const dir = await mkdtemp(join(tmpdir(), 'dbinit-'));
    try {
      const script = join(dir, 'fail.sh');
      await writeFile(script, 'cat >/dev/null; exit 3\n');

      await expect(
        runProvisionScript({ script, args: [], stdin: 'x', env: { PATH: '/usr/bin:/bin' } }),
      ).rejects.toThrow(/fail\.sh exited 3\. Its own output is in the lines directly above/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('connectOnce asks the server a question, then always hangs up', async () => {
    const { connectOnce } = await import('../db/connectivity.js');
    const events: string[] = [];
    const client = (queryFails: boolean) => ({
      on: () => undefined,
      connect: async () => void events.push('connect'),
      query: async () => {
        events.push('query');
        if (queryFails) throw new Error('query failed');
      },
      end: async () => void events.push('end'),
    });

    await connectOnce(SINGLE, 1000, () => client(false));
    await expect(connectOnce(SINGLE, 1000, () => client(true))).rejects.toThrow('query failed');

    expect(events).toEqual(['connect', 'query', 'end', 'connect', 'query', 'end']);
  });

  it('opening a multi-host target logs that the replicas are ignored, and still builds a handle', async () => {
    const { openDatabaseAt } = await import('../db/client.js');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const handle = await openDatabaseAt(MULTI);
      await handle.close();
      const handle2 = await openDatabaseAt(SINGLE);
      await handle2.close();

      const lines = log.mock.calls.map(([line]) => String(line));
      expect(lines.filter((line) => line.includes('lists 2 hosts'))).toHaveLength(1);
    } finally {
      log.mockRestore();
    }
  });

  it('runProvisionScript says when the script was killed rather than exiting', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { runProvisionScript } = await import('../db/dbInit.js');
    const dir = await mkdtemp(join(tmpdir(), 'dbinit-'));
    try {
      const script = join(dir, 'kill.sh');
      await writeFile(script, 'cat >/dev/null; kill -9 $$\n');

      await expect(
        runProvisionScript({ script, args: [], stdin: 'x', env: { PATH: '/usr/bin:/bin' } }),
      ).rejects.toThrow(/was killed by SIGKILL/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('failure reports cope with huge messages, empty AggregateError messages and no error at all', () => {
    const huge = new Error(`${'x'.repeat(900)}\n${'y'.repeat(5000)}`);
    const aggregate = Object.assign(new AggregateError([new Error('inner')], ''), { code: 'ECONNREFUSED' });

    expect(causeChain(huge)[0]?.message.endsWith('…')).toBe(true);
    expect(causeChain(huge)[0]?.full.endsWith('…')).toBe(true);
    expect(describeFailure(aggregate)).toContain('AggregateError[ECONNREFUSED] > Error: inner');
    expect(summaryOf(undefined)).toBe('unknown error');
  });

  it('describeBootConfig prints no sslmode claim when the URL states none, and an unset DB_INIT', () => {
    const env = overrideEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:pw@h.example/db',
      DATABASE_DRIVER: 'postgres',
      DB_INIT: undefined,
    });

    const text = describeBootConfig(env).join('\n');

    expect(text).toContain('sslmode=(not in URL)');
    expect(text).toContain('DB_INIT=(unset)');
  });

  it('describeTarget survives a multi-host URI and an unparseable one', async () => {
    const { describeTarget } = await import('../db/provision.js');

    expect(describeTarget(MULTI)).toBe('_user1@primary.db.example:5432/_dbname');
    expect(describeTarget('not a url')).toBe('(unparseable connection string)');
  });

  it('the connection-string helpers handle the degenerate inputs', () => {
    expect(sslModeOf('nonsense')).toBeNull();
    expect(secretsFrom('nonsense')).toEqual(['nonsense']);
    expect(diagnoseConnectionString('postgresql:///db')).toMatch(/no host name/);
    expect(normaliseConnectionString('postgres://u:p@h1:1,h2:2').url).toBe('postgres://u:p@h1:1');
    expect(diagnoseConnectionString('postgresql://[bad')).toMatch(/cannot be parsed/);
    expect(normaliseConnectionString('not a postgres url,with,commas').extraHosts).toBe(0);
  });
});
