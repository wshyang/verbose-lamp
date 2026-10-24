/**
 * The web mirror of the API's narrowing vocabulary (AGENTS-database.md §4): turn a value the
 * types call optional, but a constraint guarantees is present, into a non-optional one — and
 * fail loudly with the name of the thing if that guarantee is ever broken.
 */
export function required<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`Missing ${what}.`);
  return value;
}
