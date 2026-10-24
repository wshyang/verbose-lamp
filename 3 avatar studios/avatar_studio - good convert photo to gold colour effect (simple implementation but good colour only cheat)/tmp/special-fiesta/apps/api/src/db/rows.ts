/**
 * Narrowing the values the database hands back, in one place.
 *
 * Drizzle returns arrays and nullable columns. TypeScript widens `rows[0]` to `T | undefined`,
 * so every repository used to re-spell the same three guards — dozens of copies of a one-line
 * rule that must all agree, and dozens of defensive branches no test can honestly reach.
 * These helpers are that rule, written once and unit-tested on both arms
 * (AGENTS-function-design.md §7, "Duplicated Code → Extract Function"; ADR-013).
 */

/** A write that reports no row is a broken invariant, not a "not found" — fail loudly. */
export function firstOrThrow<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`${what}: database write returned no row`);
  return row;
}

/** A read or an update by id legitimately matches nothing — that is `null`, not an error. */
export function firstOrNull<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

/** An aggregate over an empty table still has an answer; supply it once. */
export function firstOrDefault<T>(rows: T[], fallback: T): T {
  return rows[0] ?? fallback;
}

/**
 * A value the schema guarantees — a foreign key target, a CHECK-constrained column, a router
 * path parameter. Its absence means the database or the router is not what we think it is,
 * so it throws rather than spreading `| null` through code that can do nothing about it.
 */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`${what}: expected a value, got none`);
  return value;
}

/**
 * Raw SQL results differ by driver: PGlite resolves to `{ rows }`, node-postgres to an array
 * through Drizzle's wrapper. ADR-006 keeps raw SQL to the leaderboard and the migration ledger;
 * this keeps the shape difference from leaking into either of them.
 */
export function rowsOf<T>(result: T[] | { rows: T[] }): T[] {
  return Array.isArray(result) ? result : result.rows;
}
