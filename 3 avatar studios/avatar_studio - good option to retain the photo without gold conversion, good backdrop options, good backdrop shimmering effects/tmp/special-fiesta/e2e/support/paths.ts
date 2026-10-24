import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where the repository root is, defined once.
 *
 * Three files had each counted their own way up with `'..'`, which is a claim about how deep
 * the file sits. Sorting the specs into `e2e/acceptance/`, `e2e/participant/` and the rest made
 * all three wrong at the same moment — and two of them would have failed as a missing fixture
 * file at run time rather than at compile time. A count that only one file is allowed to make
 * cannot be made wrong by moving another one.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

/** `e2e/support` → the repository root. */
export const REPO_ROOT = resolve(HERE, '..', '..');

export function fromRepo(...segments: string[]): string {
  return join(REPO_ROOT, ...segments);
}
