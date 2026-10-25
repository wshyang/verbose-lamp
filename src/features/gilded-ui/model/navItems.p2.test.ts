// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { parseNavLines, validateNavItems } from './navItems';

describe('navItems', () => {
  it('falls back to a sparkle for a missing emoji and reports duplicate or empty ids', () => {
    expect(parseNavLines(',Solo')[0]).toMatchObject({ emoji: '✦', label: 'Solo' });
    const invalid = validateNavItems([
      { id: '', emoji: '✦', label: 'One' },
      { id: '', emoji: '✦', label: 'Two' },
    ]);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.issues[0]).toContain('Duplicate or empty id');
  });
});
