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

/**
 * P6's grid check reads only the absolute `M`/`L` anchors, which skips the relative moves and the
 * arcs the camera lens, the note heads and the coupe rely on. This walks the whole path instead
 * (M, L, H, V, Z in both cases, and the circle idiom of two half-arcs), so a circle that runs off
 * the 24-unit box is caught. It does not judge whether an icon looks right: nothing here has been
 * seen drawn.
 */
function extents(path: string) {
  const tokens = path.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = '';
  const xs: number[] = [];
  const ys: number[] = [];
  const next = () => Number(tokens[i++]);
  const record = (px: number, py: number) => {
    xs.push(px);
    ys.push(py);
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
    const isRelative = command === command.toLowerCase();
    const at = (a: number, current: number) => (isRelative ? current + a : a);
    switch (command.toUpperCase()) {
      case 'M':
      case 'L': {
        const a = next();
        const b = next();
        x = at(a, x);
        y = at(b, y);
        if (command.toUpperCase() === 'M') [startX, startY] = [x, y];
        record(x, y);
        break;
      }
      case 'H':
        x = at(next(), x);
        record(x, y);
        break;
      case 'V':
        y = at(next(), y);
        record(x, y);
        break;
      case 'Z':
        [x, y] = [startX, startY];
        break;
      case 'A': {
        const radiusX = next();
        const radiusY = next();
        i += 3;
        const endX = at(next(), x);
        const endY = at(next(), y);
        // Each arc is a half circle, so its chord is a diameter and the centre is the midpoint.
        record((x + endX) / 2 - radiusX, (y + endY) / 2 - radiusY);
        record((x + endX) / 2 + radiusX, (y + endY) / 2 + radiusY);
        [x, y] = [endX, endY];
        break;
      }
      default:
        throw new Error(`unhandled path command ${command}`);
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('DECO_ICONS extents', () => {
  const GRID = 24;
  const MIN_VISIBLE_SPAN = 8;

  it.each(Object.keys(DECO_ICONS) as (keyof typeof DECO_ICONS)[])('keeps %s inside the grid, circles included', (name) => {
    const box = extents(DECO_ICONS[name]);

    expect(box.minX).toBeGreaterThanOrEqual(0);
    expect(box.minY).toBeGreaterThanOrEqual(0);
    expect(box.maxX).toBeLessThanOrEqual(GRID);
    expect(box.maxY).toBeLessThanOrEqual(GRID);
  });

  it.each(Object.keys(DECO_ICONS) as (keyof typeof DECO_ICONS)[])('draws %s large enough to read in a tile', (name) => {
    const box = extents(DECO_ICONS[name]);

    expect(box.maxX - box.minX).toBeGreaterThanOrEqual(MIN_VISIBLE_SPAN);
    expect(box.maxY - box.minY).toBeGreaterThanOrEqual(MIN_VISIBLE_SPAN);
  });

  it('actually measures the arcs: a circle pushed off the grid is seen', () => {
    expect(extents('M2 12 a4 4 0 1 0 -4 0').minX).toBeLessThan(0);
    expect(extents('M14 12 a6 6 0 1 0 12 0').maxX).toBeGreaterThan(24);
  });
});

