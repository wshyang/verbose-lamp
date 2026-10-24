import pg from 'pg';
import { connectionName } from './client.js';
import { normaliseConnectionString, redact, secretsFrom } from './connectionString.js';
import { isTransientConnectionError, summaryOf } from './failureHints.js';
import { describeTarget } from './provision.js';

/**
 * ADR-251 — can this process reach the database at all, answered before anything else touches it.
 *
 * Without this the first sign of a wrong host was whatever query ran first, reported through
 * Drizzle's wrapper as a screen of SQL. Here the question is asked on its own, with a connect
 * timeout (the pool's default is to wait forever, so an unreachable host looks like a hang), and
 * a failure that time can cure — the database still starting, a network that is not up yet — is
 * retried with backoff and a log line per attempt, instead of crash-looping the container once a
 * few seconds and leaving the platform's restart counter as the only record.
 *
 * Wrong settings are NOT retried: a bad password, a missing database or an unresolved host name
 * will be exactly as wrong in ten seconds, and waiting would only delay the message that says so.
 */

export type ConnectFn = (url: string, timeoutMs: number) => Promise<void>;

/** The slice of `pg.Client` the probe uses, so the success path runs in a test with no server. */
export interface ProbeClient {
  on: (event: 'error', listener: () => void) => unknown;
  connect: () => Promise<unknown>;
  query: (text: string) => Promise<unknown>;
  end: () => Promise<void>;
}

const makePgClient = (url: string, timeoutMs: number): ProbeClient =>
  new pg.Client({ connectionString: url, connectionTimeoutMillis: timeoutMs, application_name: connectionName() });

export interface ProbeOptions {
  attempts?: number;
  connectTimeoutMs?: number;
  connect?: ConnectFn;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  now?: () => number;
}

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const FIRST_DELAY_MS = 1_000;
const MAX_DELAY_MS = 8_000;

export async function connectOnce(
  url: string,
  timeoutMs: number,
  makeClient: (url: string, timeoutMs: number) => ProbeClient = makePgClient,
): Promise<void> {
  const client = makeClient(url, timeoutMs);
  // An error on an idle client is emitted, not thrown; with no listener it would end the process.
  client.on('error', () => {});
  await client.connect();
  try {
    await client.query('select 1');
  } finally {
    await client.end();
  }
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt: number): number {
  return Math.min(FIRST_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
}

function failedAttempt(error: unknown, attempt: number, attempts: number): boolean {
  return attempt >= attempts || !isTransientConnectionError(error);
}

export async function waitForDatabase(rawUrl: string, options: ProbeOptions = {}): Promise<void> {
  const { attempts = DEFAULT_ATTEMPTS, connect = connectOnce, sleep = realSleep } = options;
  const { connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS, log = console.log, now = Date.now } = options;
  const url = normaliseConnectionString(rawUrl).url;
  const target = describeTarget(url);
  const secrets = secretsFrom(rawUrl);
  const started = now();
  for (let attempt = 1; ; attempt += 1) {
    try {
      await connect(url, connectTimeoutMs);
      log(`[db] connected to ${target} in ${now() - started}ms (attempt ${attempt})`);
      return;
    } catch (error) {
      if (failedAttempt(error, attempt, attempts)) {
        throw new Error(`could not connect to ${target} (${attempt} attempt${attempt === 1 ? '' : 's'})`, {
          cause: error,
        });
      }
      const delay = backoffMs(attempt);
      const why = redact(summaryOf(error), secrets);
      log(`[db] cannot reach ${target}, attempt ${attempt}/${attempts}: ${why}; retrying in ${delay / 1000}s`);
      await sleep(delay);
    }
  }
}
