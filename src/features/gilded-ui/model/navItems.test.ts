import { describe, expect, it } from 'vitest';
import { parseNavLines, resolveActiveId, validateNavItems } from './navItems';

describe('navItems', () => {
  it('parses editable emoji,label lines', () => {
    const items = parseNavLines('🥂,Toast\n🎷,Program\n\n🎰,Lucky Draw');
    expect(items.length).toBe(3);
    expect(items[0].emoji).toBe('🥂');
    expect(items[2].label).toBe('Lucky Draw');
  });

  it('validates count, labels and unique ids', () => {
    expect(validateNavItems(parseNavLines('🥂,Toast\n🎷,Program')).ok).toBe(true);
    expect(validateNavItems(parseNavLines('🥂,Toast')).ok).toBe(false);
    expect(validateNavItems(parseNavLines('🥂,An Extremely Long Label\n🎷,Program')).ok).toBe(false);
  });

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

describe('resolveActiveId', () => {
  const items = parseNavLines('🏛️,Foyer\n🎷,Program\n🥂,Toast');

  it('keeps the requested id when it is in the bar', () => {
    expect(resolveActiveId(items, items[2].id)).toBe(items[2].id);
  });

  it('falls back to the first item when the id is unknown or empty', () => {
    expect(resolveActiveId(items, 'nav-9-gone')).toBe(items[0].id);
    expect(resolveActiveId(items, '')).toBe(items[0].id);
  });

  it('returns an empty id for an empty bar', () => {
    expect(resolveActiveId([], 'anything')).toBe('');
  });
});
describe('bare comma lines', () => {
  it('falls back to a diamond when the emoji slot is empty', () => {
    const [item] = parseNavLines('   ,  Fifth  \n✦, Sixth');
    expect(item.emoji).toBe('✦');
    expect(item.label).toBe('Fifth');
  });
});
