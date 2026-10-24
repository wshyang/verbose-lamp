/**
 * ADR-088 — naming which unique index refused a write.
 *
 * The insert-and-retry pattern is only correct if the catch can tell WHOSE collision it
 * caught: a scan-number collision is retryable with a fresh mint, a nickname collision is a
 * 409 for the caller, and anything else is a bug that must keep crashing. Postgres names the
 * violated constraint on the error; drizzle sometimes wraps the driver error, so the walk
 * follows `cause` a bounded number of steps rather than trusting any one shape.
 */

const UNIQUE_VIOLATION = '23505';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** The violated unique constraint's name, or null when the error is not a unique violation. */
export function uniqueViolationOf(error: unknown): string | null {
  let current = record(error);
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (String(current['code']) === UNIQUE_VIOLATION && typeof current['constraint'] === 'string') {
      return current['constraint'];
    }
    current = record(current['cause']);
  }
  return null;
}
