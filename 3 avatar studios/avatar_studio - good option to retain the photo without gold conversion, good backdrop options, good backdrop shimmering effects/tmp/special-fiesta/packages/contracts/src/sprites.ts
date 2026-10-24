import { z } from 'zod';
import { messages } from './messages.js';

/**
 * ADR-031 — a participant may wear their own face instead of one of the five characters.
 *
 * The photo itself never leaves the phone: the browser turns it into a small indexed
 * sprite and only the sprite travels. This module owns that format, because both ends
 * need it — the browser to write it, the server to refuse anything that is not one.
 *
 *   `<size>:<hex>,<hex>,…:<runs>`   e.g. `128:1d5b8c,e0a878,…:000k1002…`
 *
 * A run is one palette index as a hex digit followed by its length in exactly three
 * base-36 digits, so a flat background costs four characters instead of a thousand. The
 * width is fixed because a variable-length count is ambiguous: `a1` followed by `b2`
 * cannot be told apart from a single run of `1b2`. Sixteen colours is the cap — one hex
 * digit each, and more than that stops looking like pixel art anyway.
 *
 * ADR-037 — new sprites are generated at 128×128; the 64×64 sprites already stored
 * remain valid, so a face saved before the change never breaks. Both ends accept both.
 */

/** The size new photo sprites are generated at. */
export const AVATAR_SPRITE_SIZE = 128;
/** Every size a stored sprite may legitimately have: today's, and yesterday's. */
export const AVATAR_SPRITE_SIZES: ReadonlySet<number> = new Set([64, 128]);
export const AVATAR_SPRITE_MAX_COLOURS = 16;
/**
 * Comfortably above a real 128×128 sprite — a busy selfie kept whole runs to ~20 kB,
 * and despeckling means runs of one cell are rare, so ~33 kB is the realistic ceiling —
 * and still far below anything abusive.
 */
export const AVATAR_SPRITE_MAX_LENGTH = 50000;

export interface AvatarSprite {
  size: number;
  /** Palette index → `#rrggbb`, keyed by the hex digit the rows use. */
  palette: Record<string, string>;
  /** One string per row, each character a palette index. */
  rows: string[];
}

const SPRITE_PATTERN = /^(\d{2,3}):([0-9a-f]{6}(?:,[0-9a-f]{6})*):((?:[0-9a-f][0-9a-z]{3})+)$/;

function paletteOf(entries: string[]): Record<string, string> | null {
  if (entries.length > AVATAR_SPRITE_MAX_COLOURS) return null;
  const palette: Record<string, string> = {};
  entries.forEach((hex, index) => {
    palette[index.toString(16)] = `#${hex}`;
  });
  return palette;
}

function rowsOf(runs: string, size: number, colours: number): string[] | null {
  let flat = '';
  for (const [, key, length] of runs.matchAll(/([0-9a-f])([0-9a-z]{3})/g)) {
    if (Number.parseInt(String(key), 16) >= colours) return null;
    flat += String(key).repeat(Number.parseInt(String(length), 36));
    if (flat.length > size * size) return null;
  }
  if (flat.length !== size * size) return null;
  const rows: string[] = [];
  for (let y = 0; y < size; y += 1) rows.push(flat.slice(y * size, (y + 1) * size));
  return rows;
}

/** Anything malformed returns null; callers decide whether that is an error. */
export function parseAvatarSprite(code: string): AvatarSprite | null {
  if (code.length > AVATAR_SPRITE_MAX_LENGTH) return null;
  const match = SPRITE_PATTERN.exec(code);
  if (!match) return null;
  const size = Number(match[1]);
  if (!AVATAR_SPRITE_SIZES.has(size)) return null;
  const palette = paletteOf(String(match[2]).split(','));
  if (palette === null) return null;
  const rows = rowsOf(String(match[3]), size, Object.keys(palette).length);
  if (rows === null) return null;
  return { size, palette, rows };
}

/** Rows of palette digits plus the colours they mean, as one storable string. */
export function formatAvatarSprite(input: { size: number; palette: string[]; rows: string[] }): string {
  const flat = input.rows.join('');
  let runs = '';
  let start = 0;
  for (let index = 1; index <= flat.length; index += 1) {
    if (index < flat.length && flat[index] === flat[start]) continue;
    runs += `${flat[start]}${(index - start).toString(36).padStart(3, '0')}`;
    start = index;
  }
  const palette = input.palette.map((hex) => hex.replace('#', '').toLowerCase()).join(',');
  return `${input.size}:${palette}:${runs}`;
}

/**
 * ADR-054 — repaint a photo sprite's backdrop, without touching a single pixel.
 *
 * `photoToSprite` always emits its palette as `[...colours taken from the photograph, backdrop,
 * ink]`, so the backdrop is the second-to-last entry by construction and swapping it is pure string
 * surgery. That is what makes backdrop choice worth offering on a photo avatar at all: once the
 * cut-out model has removed the real background there is a genuine backdrop behind the person, and
 * it is the one colour in a photo sprite the participant actually owns — hair, skin and shirt are
 * photograph, not paint.
 *
 * Doing it this way rather than re-running the pipeline matters: the source bitmap is deliberately
 * thrown away (ADR-031), so a sprite restored from a draft has no pixels left to re-derive from.
 * Returns null for anything malformed, on the same terms as `parseAvatarSprite`.
 */
export function recolourSpriteBackdrop(code: string, backdrop: string): string | null {
  if (parseAvatarSprite(code) === null) return null;
  const [size, palette, runs] = code.split(':');
  const colours = String(palette).split(',');
  // Backdrop and ink are the last two; a sprite with fewer than two colours is not a photo sprite.
  if (colours.length < 2) return null;
  colours[colours.length - 2] = backdrop.replace('#', '').toLowerCase();
  const recoloured = `${size}:${colours.join(',')}:${runs}`;
  return parseAvatarSprite(recoloured) === null ? null : recoloured;
}

export const avatarSpriteSchema = z
  .string()
  .refine((value) => parseAvatarSprite(value) !== null, messages.avatarPhotoInvalid);

/**
 * ADR-035 — how a sprite is addressed.
 *
 * The sprite is immutable: change your photo and you get a different one. So it is
 * referred to by a hash of its own contents, which means a browser that has seen a face
 * once never needs it again, and a leaderboard row costs sixteen characters instead of
 * three kilobytes.
 *
 * FNV-1a twice with different offsets — 64 bits of id, a few microseconds, no
 * dependency. Cryptographic strength is not the point; not colliding across a few
 * hundred participants is.
 */
export function avatarSpriteId(sprite: string): string {
  const hash = (offset: number, prime: number) => {
    let value = offset;
    for (let at = 0; at < sprite.length; at += 1) {
      value ^= sprite.charCodeAt(at);
      value = Math.imul(value, prime) >>> 0;
    }
    return value.toString(16).padStart(8, '0');
  };
  return `${hash(0x811c9dc5, 0x01000193)}${hash(0x9e3779b9, 0x85ebca6b)}`;
}

export const AVATAR_SPRITE_ID_PATTERN = /^[0-9a-f]{16}$/;
