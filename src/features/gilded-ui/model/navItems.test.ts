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

// The nav lines are typed by hand in the console, so every shape of a bad line has to come out as
// something the bar can draw or something the validator names, never a crash.
describe('parseNavLines on hand-typed input', () => {
  it('reads a line with no comma as a glyph with an empty label', () => {
    const [item] = parseNavLines('🥂');

    expect(item.emoji).toBe('🥂');
    expect(item.label).toBe('');
    expect(item.id).toBe('nav-0-item');
  });

  it('falls back to the house star when the glyph is missing', () => {
    const [item] = parseNavLines(',Foyer');

    expect(item.emoji).toBe('✦');
    expect(item.label).toBe('Foyer');
  });

  it('keeps only the first grapheme of a long glyph field', () => {
    expect(parseNavLines('🥂🎷,Toast')[0].emoji).toBe('🥂');
  });

  it('skips blank lines and trims the rest', () => {
    const items = parseNavLines('\n  🏛️ ,  Foyer  \n\n🎷,Program\n');

    expect(items.map((item) => item.label)).toEqual(['Foyer', 'Program']);
  });

  it('builds an id from the label that is unique by position even for the same label', () => {
    const items = parseNavLines('🥂,Toast\n🥂,Toast');

    expect(items[0].id).toBe('nav-0-toast');
    expect(items[1].id).toBe('nav-1-toast');
  });

  it('does not leave hyphens at the ends of an id built from a label with edge punctuation', () => {
    expect(parseNavLines('🥂,!Toast!')[0].id).toBe('nav-0-toast');
    expect(parseNavLines('🥂,Lucky  Draw')[0].id).toBe('nav-0-lucky-draw');
  });

  it('turns a label of only symbols into the placeholder id', () => {
    expect(parseNavLines('🥂,***')[0].id).toBe('nav-0-item');
  });
});

describe('validateNavItems labels', () => {
  const items = (labels: string[]) => labels.map((label, i) => ({ id: `n${i}`, emoji: '🥂', label }));

  it('names an item with a blank label', () => {
    const result = validateNavItems(items(['Foyer', '   ']));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.includes('needs a label'))).toBe(true);
  });

  it('names a label over fourteen characters, and accepts exactly fourteen', () => {
    const long = validateNavItems(items(['Foyer', 'x'.repeat(15)]));
    const exact = validateNavItems(items(['Foyer', 'x'.repeat(14)]));

    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.issues.some((issue) => issue.includes('exceeds 14'))).toBe(true);
    expect(exact.ok).toBe(true);
  });

  it('accepts both ends of the two-to-five range', () => {
    expect(validateNavItems(items(['a', 'b'])).ok).toBe(true);
    expect(validateNavItems(items(['a', 'b', 'c', 'd', 'e'])).ok).toBe(true);
  });
});

