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

describe('validateNavItems edge cases', () => {
  it('names duplicate and empty ids instead of silently keeping them', () => {
    const result = validateNavItems([
      { id: 'foyer', emoji: '🏛', label: 'Foyer' },
      { id: 'foyer', emoji: '🥂', label: 'Toast' },
      { id: '', emoji: '🎷', label: 'Program' },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.includes('foyer'))).toBe(true);
    expect(result.issues.some((issue) => issue.includes('Duplicate or empty id'))).toBe(true);
  });

  it('rejects a bar with fewer than two or more than five items', () => {
    const one = validateNavItems([{ id: 'a', emoji: '🏛', label: 'Foyer' }]);
    const six = validateNavItems(
      Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, emoji: '🥂', label: `Item ${i}` }))
    );

    expect(one.ok).toBe(false);
    expect(six.ok).toBe(false);
  });
});
