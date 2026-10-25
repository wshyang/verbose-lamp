// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { parseNavLines, validateNavItems } from './navItems';

describe('validateNavItems rejects broken rows', () => {
  it('flags empty ids, duplicates and unlabelled items', () => {
    const result = validateNavItems([
      { id: '', emoji: '✦', label: 'Lobby' },
      { id: 'nav-a', emoji: '✦', label: 'Lobby' },
      { id: 'nav-a', emoji: '✦', label: 'Lobby' },
      { id: 'nav-b', emoji: '✦', label: '   ' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          'Duplicate or empty id "".',
          'Duplicate or empty id "nav-a".',
          'Item "nav-b" needs a label.',
        ]),
      );
    }
  });
});
describe('parseNavLines without a comma', () => {
  it('falls back to a diamond for an empty glyph', () => {
    const [item] = parseNavLines(', Ballroom');
    expect(item.emoji).toBe('✦');
    expect(item.label).toBe('Ballroom');
    expect(item.id).toBe('nav-0-ballroom');
  });
});
