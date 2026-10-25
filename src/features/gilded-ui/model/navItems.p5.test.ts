// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { validateNavItems } from './navItems';

describe('validateNavItems limits', () => {
  it('flags a fifteen-character label and a six-item bar', () => {
    const longLabel = validateNavItems([
      { id: 'a', emoji: '✦', label: 'A'.repeat(15) },
      { id: 'b', emoji: '🎷', label: 'Program' },
    ]);
    expect(longLabel.ok).toBe(false);
    if (!longLabel.ok) expect(longLabel.issues.some((issue) => issue.includes('exceeds 14'))).toBe(true);

    const six = validateNavItems(
      Array.from({ length: 6 }, (_, i) => ({ id: `nav-${i}`, emoji: '✦', label: `Item ${i}` })),
    );
    expect(six.ok).toBe(false);
    if (!six.ok) expect(six.issues.some((issue) => issue.includes('bottom bar'))).toBe(true);
  });
});
