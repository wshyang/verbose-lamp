import type { IndexedSprite } from '../types';

/**
 * ADDENDUM-017 — the indexed-sprite codec, ported from the beach app's contracts.
 *
 * A sprite is a small picture written as text, so a portrait can travel as a string:
 *
 *   `<size>:<hex>,<hex>,…:<runs>`   e.g. `128:1d5b8c,e0a878,…:000k1002…`
 *
 * A run is one palette index as a hex digit followed by its length in exactly three
 * base-36 digits, so a flat ground costs four characters instead of a thousand. The
 * width is fixed because a variable-length count is ambiguous: `a1` followed by `b2`
 * cannot be told apart from a single run of `1b2`.
 *
 * Sixteen colours is the cap — one hex digit each — and more than that stops looking
 * like pixel art anyway.
 */

/** The sizes a stored sprite may legitimately have. */
export const SPRITE_SIZES: ReadonlySet<number> = new Set([64, 128]);

/** One hex digit per colour, so sixteen is the ceiling. */
export const SPRITE_MAX_COLOURS = 16;

/** Comfortably above a real 128×128 sprite, and well below anything abusive. */
export const SPRITE_MAX_LENGTH = 50000;

const SPRITE_PATTERN = /^(\d{2,3}):([0-9a-f]{6}(?:,[0-9a-f]{6})*):((?:[0-9a-f][0-9a-z]{3})+)$/;

function rowsOf(runs: string, size: number, colours: number): string[] | null {
  let flat = '';
  for (const [, key, length] of runs.matchAll(/([0-9a-f])([0-9a-z]{3})/g)) {
    if (Number.parseInt(key, 16) >= colours) return null;
    flat += key.repeat(Number.parseInt(length, 36));
    if (flat.length > size * size) return null;
  }
  if (flat.length !== size * size) return null;
  const rows: string[] = [];
  for (let y = 0; y < size; y += 1) rows.push(flat.slice(y * size, (y + 1) * size));
  return rows;
}

/** Anything malformed returns null; callers decide whether that is an error. */
export function parseIndexedSprite(code: string): IndexedSprite | null {
  if (code.length > SPRITE_MAX_LENGTH) return null;
  const match = SPRITE_PATTERN.exec(code);
  if (!match) return null;
  const size = Number(match[1]);
  if (!SPRITE_SIZES.has(size)) return null;
  const colours = match[2].split(',');
  if (colours.length > SPRITE_MAX_COLOURS) return null;
  const rows = rowsOf(match[3], size, colours.length);
  if (rows === null) return null;
  return { size, palette: colours.map((hex) => `#${hex}`), rows };
}

/** Rows of palette digits plus the colours they mean, as one storable string. */
export function formatIndexedSprite(sprite: IndexedSprite): string {
  const flat = sprite.rows.join('');
  let runs = '';
  let start = 0;
  for (let index = 1; index <= flat.length; index += 1) {
    if (index < flat.length && flat[index] === flat[start]) continue;
    runs += `${flat[start]}${(index - start).toString(36).padStart(3, '0')}`;
    start = index;
  }
  const palette = sprite.palette.map((hex) => hex.replace('#', '').toLowerCase()).join(',');
  return `${sprite.size}:${palette}:${runs}`;
}
