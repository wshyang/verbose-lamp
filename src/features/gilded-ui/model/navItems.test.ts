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

describe('parseNavLines fallbacks', () => {
  it('names label-less lines "item" and gives emoji-less lines the star', () => {
    const items = parseNavLines('🏠\n,Tickets\n✦,!!!\n🎷,Live Music');
    // '!!!' slugs to a lone '-' (truthy), so only an empty label falls back to 'item'.
    expect(items.map((item) => item.id)).toEqual(['nav-0-item', 'nav-1-tickets', 'nav-2--', 'nav-3-live-music']);
    expect(items[1].emoji).toBe('✦'); // leading comma → no glyph before it
    expect(items[0].label).toBe('');
  });
});

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

describe('validateNavItems identity checks', () => {
  it('flags duplicate ids and blank labels', () => {
    const result = validateNavItems([
      { id: 'dup', emoji: '✦', label: 'One' },
      { id: 'dup', emoji: '🎷', label: '   ' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.includes('Duplicate or empty id'))).toBe(true);
      expect(result.issues.some((issue) => issue.includes('needs a label'))).toBe(true);
    }
  });
});
