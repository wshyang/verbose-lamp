// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { validateEntries } from './entries';

const gatsby_p3 = { id: 'gatz', name: 'Jay Gatsby', subtitle: 'West Egg' };
describe('validateEntries without an id', () => {
  it('reports a missing id', () => {
    const result = validateEntries([gatsby_p3, { id: '', name: 'Anonymous' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('An entry is missing its id.');
  });
});
