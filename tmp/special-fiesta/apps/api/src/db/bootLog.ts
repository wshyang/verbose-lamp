import { resolveDriver, type AppEnv } from '../env.js';
import { sslModeOf } from './connectionString.js';
import { describeFailure } from './failureHints.js';
import { describeTarget } from './provision.js';

/**
 * ADR-251 — a boot that says where it is, and a failure that says where it stopped.
 *
 * The old log for a failed start was one line, `[api] failed to start`, followed by whatever the
 * exception printed. It never said which stage of boot was running, what the app had been told to
 * do, or what to check. Each stage is now a named step with a start line, an end line and a
 * duration; a failure carries the step it happened in; and the configuration the app actually
 * received is printed once, with every credential reduced to "set" or "not set".
 */

export type LogFn = (line: string) => void;

export class BootStepError extends Error {
  readonly step: string;

  constructor(step: string, cause: unknown) {
    super(`failed while: ${step}`, { cause });
    this.name = 'BootStepError';
    this.step = step;
  }
}

/** Runs one stage of boot, logging its start and end. The innermost failing step names the failure. */
export async function bootStep<T>(
  step: string,
  work: () => Promise<T>,
  log: LogFn = console.log,
): Promise<T> {
  const started = Date.now();
  log(`[boot] ${step}…`);
  try {
    const result = await work();
    log(`[boot] ${step}: ok (${Date.now() - started}ms)`);
    return result;
  } catch (error) {
    throw error instanceof BootStepError ? error : new BootStepError(step, error);
  }
}

function databaseSummary(env: AppEnv): string {
  const url = env.DATABASE_URL ?? '';
  if (resolveDriver(env) === 'pglite' || url === '') return `driver=pglite dataDir=${env.PGLITE_DATA_DIR}`;
  const ssl = sslModeOf(url);
  return `driver=postgres target=${describeTarget(url)} sslmode=${ssl ?? '(not in URL)'}`;
}

function adminLines(env: AppEnv): string[] {
  if (!env.DATABASE_URL_ADMIN) return [];
  const target = describeTarget(env.DATABASE_URL_ADMIN);
  if (!env.DB_INIT) {
    return [`WARNING: DATABASE_URL_ADMIN is set (${target}) but DB_INIT is not, so it is NOT being used.`];
  }
  return [`config: DB_INIT will provision as ${target} (DATABASE_URL_ADMIN), then grant to the app role`];
}

/** What the app was told, safe to print: credentials appear only as set / not set. */
function resetLines(env: AppEnv): string[] {
  if (!env.DB_INIT_RESET) return [];
  if (!env.DB_INIT) {
    return ['WARNING: DB_INIT_RESET is set but DB_INIT is not, so it is NOT being used.'];
  }
  return [`config: DB_INIT_RESET=stale: a schema older than this build's will be reset before DB_INIT`];
}

export function describeBootConfig(env: AppEnv, nodeVersion: string = process.version): string[] {
  const lines = [
    `config: node=${nodeVersion} NODE_ENV=${env.NODE_ENV} PORT=${env.PORT} ${databaseSummary(env)}`,
    `config: DB_INIT=${env.DB_INIT ?? '(unset)'} DB_INIT_RESET=${env.DB_INIT_RESET ?? '(unset)'} PSD_SEED=${env.PSD_SEED} ` +
      `SUPERADMIN_INITIAL_PASSCODE=${env.SUPERADMIN_INITIAL_PASSCODE ? 'set' : 'NOT SET'} ` +
      `PROCESS_SUPERVISED=${env.PROCESS_SUPERVISED}`,
  ];
  lines.push(...adminLines(env));
  lines.push(...resetLines(env));
  if (env.DATABASE_URL === '') {
    // Empty is not unset to a platform, but it is to this app: it falls back to the embedded
    // database, on a container filesystem that is gone at the next deploy.
    lines.push(
      'WARNING: DATABASE_URL is set but empty, so this app is using the embedded PGlite database ' +
        'and NOT your Postgres. If that is not intended, the variable reference resolves to nothing.',
    );
  }
  if (env.DATABASE_URL && env.DATABASE_DRIVER === 'pglite') {
    lines.push('WARNING: DATABASE_URL is set but DATABASE_DRIVER=pglite overrides it: it is being ignored.');
  }
  return lines;
}

/** The lines to print when boot fails: where, why, and what to check. Never contains a secret. */
export function reportBootFailure(error: unknown, secrets: readonly string[]): string[] {
  const step = error instanceof BootStepError ? error.step : 'startup';
  const body = describeFailure(error, secrets).split('\n');
  return [`FAILED TO START during: ${step}`, ...body];
}
