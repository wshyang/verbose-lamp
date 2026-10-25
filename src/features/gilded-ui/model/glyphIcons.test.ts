import { describe, expect, it } from 'vitest';
import { DECO_ICONS, iconNameFor, iconPathFor } from './glyphIcons';
import { parseNavLines } from './navItems';

/**
 * The glyph table is the fix for ADDENDUM-032: emoji `<text>` in the gilded nav bar
 * rendered as tofu wherever no colour-emoji font is installed. The paths have to
 * resolve for every glyph the UI ships, and for nothing else.
 */
const SHIPPED = ['🏛️', '🎷', '🎰', '🥂', '📸'] as const;

describe('iconNameFor', () => {
  it('resolves every glyph the gilded UI ships with', () => {
    expect(SHIPPED.map((emoji) => iconNameFor(emoji))).toEqual([
      'portico',
      'note',
      'dice',
      'coupe',
      'camera',
    ]);
  });

  it('ignores the emoji presentation selector', () => {
    expect(iconNameFor('🏛\uFE0F')).toBe('portico');
    expect(iconNameFor('🏛\uFE0E')).toBe('portico');
    expect(iconNameFor(' 🏛 ')).toBe('portico');
  });

  it('returns null for a glyph we have not drawn, so the emoji still shows', () => {
    expect(iconNameFor('🦄')).toBeNull();
    expect(iconNameFor('')).toBeNull();
    expect(iconNameFor('✦')).toBeNull();
    // A hand-edited line can leave a label with no glyph at all.
    expect(iconNameFor(undefined)).toBeNull();
    expect(iconNameFor('')).toBeNull();
  });
});

describe('iconPathFor', () => {
  it('returns the path data for a known glyph', () => {
    expect(iconPathFor('🥂')).toBe(DECO_ICONS.coupe);
    expect(iconPathFor('🥂')).toContain('M');
  });

  it('returns null for an unknown glyph', () => {
    expect(iconPathFor('🦄')).toBeNull();
  });

  it('covers the default nav bar line for line', () => {
    // The nav bar is built from `parseNavLines`, whose first grapheme is the glyph.
    const parsed = parseNavLines('🏛️,Foyer\n🎷,Program\n🎰,Lucky Draw\n🥂,Toast\n📸,Gallery');
    expect(parsed).toHaveLength(5);
    for (const item of parsed) expect(iconPathFor(item.emoji)).not.toBeNull();
  });
});

describe('DECO_ICONS', () => {
  it('draws every icon as finite path data starting from a move', () => {
    for (const [name, path] of Object.entries(DECO_ICONS)) {
      expect(path, name).toMatch(/^M/);
      expect(path, name).not.toMatch(/NaN|Infinity|undefined/);
      expect(path.match(/[A-Za-z]/g)?.every((c) => 'MLHVZQCAmlhvzqca'.includes(c)), name).toBe(true);
      expect(path.match(/-?\d+(\.\d+)?/g)?.length ?? 0, name).toBeGreaterThan(6);
    }
  });

  it('draws on the 24 × 24 grid the glyph component scale assumes', () => {
    // `GildedGlyph` renders svg paths inside `translate(8 8) scale(2)`, i.e. a
    // 24-unit box inside the 64-unit viewBox. Absolute anchors must stay in it.
    for (const [name, path] of Object.entries(DECO_ICONS)) {
      const anchors = [...path.matchAll(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)];
      expect(anchors.length, name).toBeGreaterThan(1);
      for (const [, , x, y] of anchors) {
        expect(Number(x), name).toBeGreaterThanOrEqual(0);
        expect(Number(x), name).toBeLessThanOrEqual(24);
        expect(Number(y), name).toBeGreaterThanOrEqual(0);
        expect(Number(y), name).toBeLessThanOrEqual(24);
      }
    }
  });

  it('is frozen so a stray write cannot corrupt the render', () => {
    expect(Object.isFrozen(DECO_ICONS)).toBe(true);
  });
});
