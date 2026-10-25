// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { validateEntries } from './entries';

describe('validateEntries edge cases', () => {
  it('flags an entry that lost its id and one with no name', () => {
    const result = validateEntries([
      { id: '', name: 'Nobody' },
      { id: 'g2', name: '' },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.join(" ")).toContain('missing its id');
    expect(result.issues.join(" ")).toContain('empty name');
  });
});
