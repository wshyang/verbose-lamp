// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { parseNavLines, validateNavItems } from './navItems';

describe('navItems', () => {
  it('reports duplicate and empty ids, empty labels and an oversized bar', () => {
    const duplicate = validateNavItems([
      { id: 'nav-1', emoji: '🥂', label: 'Toast' },
      { id: 'nav-1', emoji: '🎷', label: 'Program' },
    ]);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.issues[0]).toContain('Duplicate or empty id');

    const empty = validateNavItems([
      { id: '', emoji: '🥂', label: 'Toast' },
      { id: 'nav-2', emoji: '🎷', label: '   ' },
    ]);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.issues.some((issue) => issue.includes('needs a label'))).toBe(true);

    const crowded = validateNavItems(
      Array.from({ length: 6 }, (_, index) => ({ id: `nav-${index}`, emoji: '✦', label: `Item ${index}` }))
    );
    expect(crowded.ok).toBe(false);
    if (!crowded.ok) expect(crowded.issues).toContain('A bottom bar takes 2–5 items.');
  });

  it('keeps the first glyph of a bare emoji line and names the id "item"', () => {
    const [item] = parseNavLines('🎩');
    expect(item.label).toBe('');
    expect(item.id).toBe('nav-0-item');
    expect(item.emoji).toBe('🎩');
  });
});
describe('bare comma lines', () => {
  it('falls back to a diamond when the emoji slot is empty', () => {
    const [item] = parseNavLines('   ,  Fifth  \n✦, Sixth');
    expect(item.emoji).toBe('✦');
    expect(item.label).toBe('Fifth');
  });
});
