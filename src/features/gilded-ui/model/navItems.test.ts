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
  it('keeps the whole line as the glyph and leaves the label empty', () => {
    const [item] = parseNavLines('🥂');
    expect(item.emoji).toBe('🥂');
    expect(item.label).toBe('');
    expect(item.id).toBe('nav-0-item');
  });

  it('falls back to a diamond for an empty glyph', () => {
    const [item] = parseNavLines(', Ballroom');
    expect(item.emoji).toBe('✦');
    expect(item.label).toBe('Ballroom');
    expect(item.id).toBe('nav-0-ballroom');
  });
});
