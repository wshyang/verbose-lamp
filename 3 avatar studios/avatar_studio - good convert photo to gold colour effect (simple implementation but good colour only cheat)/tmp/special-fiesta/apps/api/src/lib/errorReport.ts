/**
 * ADR-228 — what an unhandled error may say in the log.
 *
 * `console.error(…, error)` printed the whole error object, and a failed query's error carries its bound
 * values. drizzle's `DrizzleQueryError` builds its message as `Failed query: <sql>\nparams: <values>`, so a
 * save that carried a photo wrote the photo into the log on every failure: the look-check failure observed for
 * pattern looks (N2). The report keeps what says what went wrong, the name, the message with the values taken
 * out, the SQL text with its placeholders, the database's code, constraint, table and column, and the stack
 * frames. It keeps nothing else, and in particular neither the bound values nor the database's `detail`, which
 * is where Postgres quotes the failing row.
 */

/** A photo sprite, as the database and the API both write it: `128:<palette>:<rows>`. */
const SPRITE = /(?:64|128):[0-9a-f,]{6,200}:(?:[0-9a-f][0-9a-z]{3})+/g;

/** Any sprite in a string is replaced before the string is logged. A second line of defence, not the first. */
export function scrubPhotos(text: string): string {
  return text.replace(SPRITE, '[photo]');
}

/** What a database error may contribute to the log, one level of its cause at a time. */
export interface DatabaseReport {
  name?: string | undefined;
  message?: string | undefined;
  code?: string | undefined;
  constraint?: string | undefined;
  table?: string | undefined;
  column?: string | undefined;
  cause?: DatabaseReport | undefined;
}

/** What an unhandled error may contribute to the log. Every field is optional: only what is known is written. */
export interface UnhandledReport extends DatabaseReport {
  /** For a failed query: the statement, with its placeholders. Never the values. */
  query?: string | undefined;
  /** For a value that is not an error. */
  value?: string | undefined;
  frames?: string[] | undefined;
}

/** The fields a driver puts on its errors. Only these are read; everything else is left out. */
interface DriverFields {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  constraint?: unknown;
  table?: unknown;
  column?: unknown;
  cause?: unknown;
  /** drizzle's failed-query error: the statement, with placeholders. */
  query?: unknown;
  /** drizzle's failed-query error: the values, which must never be logged. Only its presence is read. */
  params?: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** The database's complaint, one level at a time, without its `detail` or any value it quotes. */
function describeCause(cause: unknown, depth: number): DatabaseReport {
  if (cause === null || typeof cause !== 'object') return { message: scrubPhotos(String(cause)) };
  const fields: DriverFields = cause;
  const message = text(fields.message);
  const report: DatabaseReport = {
    name: text(fields.name),
    message: message === undefined ? undefined : scrubPhotos(message),
    code: text(fields.code),
    constraint: text(fields.constraint),
    table: text(fields.table),
    column: text(fields.column),
  };
  if (fields.cause !== undefined && depth < 3) report.cause = describeCause(fields.cause, depth + 1);
  return withoutUndefined(report);
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

export function describeUnhandledError(error: unknown): UnhandledReport {
  if (!(error instanceof Error)) {
    return { value: typeof error === 'string' ? scrubPhotos(error) : typeof error };
  }
  const failed: Error & DriverFields = error;
  const sql = text(failed.query) ?? null;
  // drizzle's failed-query error keeps the values in its message. Report the statement, not the values.
  const message = sql !== null && 'params' in failed ? `Failed query: ${sql}` : error.message;
  const report: UnhandledReport = withoutUndefined({
    name: error.name,
    message: scrubPhotos(message),
    query: sql === null ? undefined : scrubPhotos(sql),
    code: text(failed.code),
    constraint: text(failed.constraint),
    table: text(failed.table),
    column: text(failed.column),
    cause: failed.cause === undefined ? undefined : describeCause(failed.cause, 1),
    frames: (error.stack ?? '')
      .split('\n')
      .filter((line) => line.startsWith('    at '))
      .map(scrubPhotos),
  });
  return report;
}
