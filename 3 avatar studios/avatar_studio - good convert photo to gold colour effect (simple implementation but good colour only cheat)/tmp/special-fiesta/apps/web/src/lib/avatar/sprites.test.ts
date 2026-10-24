import { describe, expect, it } from 'vitest';
import {
  AVATAR_SPRITE_MAX_LENGTH,
  AVATAR_SPRITE_SIZE,
  formatAvatarSprite,
  parseAvatarSprite,
  recolourSpriteBackdrop,
} from '@psd/contracts';

/** ADR-031 — the sprite wire format, which both the browser and the server depend on. */

const rows = (fill: string, size = AVATAR_SPRITE_SIZE) =>
  Array.from({ length: size }, () => fill.repeat(size));

describe('avatar sprites', () => {
  it('round-trips rows and a palette', () => {
    const code = formatAvatarSprite({
      size: AVATAR_SPRITE_SIZE,
      palette: ['#1d5b8c', '#E0A878'],
      rows: rows('0'),
    });
    const parsed = parseAvatarSprite(code);

    expect(parsed?.size).toBe(AVATAR_SPRITE_SIZE);
    expect(parsed?.palette).toEqual({ '0': '#1d5b8c', '1': '#e0a878' });
    expect(parsed?.rows).toEqual(rows('0'));
    // A flat 16 384-cell grid is one run, not sixteen thousand.
    expect(code.length).toBeLessThan(40);
  });

  it('still accepts a 64×64 sprite stored before ADR-037', () => {
    const code = formatAvatarSprite({ size: 64, palette: ['#1d5b8c', '#e0a878'], rows: rows('0', 64) });
    const parsed = parseAvatarSprite(code);

    expect(parsed?.size).toBe(64);
    expect(parsed?.rows).toEqual(rows('0', 64));
  });

  it('keeps the runs unambiguous where a count could look like an index', () => {
    const mixed = rows('0').map((row, index) => (index % 2 === 0 ? row : '1'.repeat(AVATAR_SPRITE_SIZE)));
    const code = formatAvatarSprite({ size: AVATAR_SPRITE_SIZE, palette: ['#000000', '#ffffff'], rows: mixed });

    expect(parseAvatarSprite(code)?.rows).toEqual(mixed);
  });

  it('refuses anything that is not a sprite', () => {
    expect(parseAvatarSprite('')).toBeNull();
    expect(parseAvatarSprite('nope')).toBeNull();
    // Wrong size — neither today's 128 nor the legacy 64.
    expect(parseAvatarSprite('32:1d5b8c:0100')).toBeNull();
    expect(parseAvatarSprite('96:1d5b8c:0100')).toBeNull();
    // Too few cells for the grid it claims.
    expect(parseAvatarSprite('64:1d5b8c:0010')).toBeNull();
    // An index no palette entry answers to.
    expect(parseAvatarSprite(`64:1d5b8c:${'f'}${(64 * 64).toString(36).padStart(3, '0')}`)).toBeNull();
    // Seventeen colours.
    const many = Array.from({ length: 17 }, (_unused, index) => `#0000${index.toString(16).padStart(2, '0')}`);
    expect(parseAvatarSprite(formatAvatarSprite({ size: 64, palette: many, rows: rows('0', 64) }))).toBeNull();
    // Longer than anything a phone would ever produce.
    expect(parseAvatarSprite(`64:1d5b8c:${'0abc'.repeat(AVATAR_SPRITE_MAX_LENGTH)}`)).toBeNull();
  });

  it('refuses a grid that overflows its own size', () => {
    const tooMany = `64:1d5b8c:${'0zzz'.repeat(6)}`;
    expect(parseAvatarSprite(tooMany)).toBeNull();
  });
});

/**
 * ADR-054 — repainting a photo sprite's backdrop.
 *
 * A photo sprite's palette is `[...photograph colours, backdrop, ink]`, which is what lets the
 * backdrop be swapped without the source pixels — and there are none to go back to, because the
 * photo is deliberately thrown away (ADR-031).
 */
describe('recolourSpriteBackdrop', () => {
  /** Three photo colours, then the backdrop, then the ink: the shape `photoToSprite` emits. */
  const photoSprite = () =>
    formatAvatarSprite({
      size: AVATAR_SPRITE_SIZE,
      palette: ['112233', '445566', '778899', 'aabbcc', '000000'],
      rows: rows('0'),
    });

  it('replaces the backdrop and leaves every photograph colour alone', () => {
    const recoloured = recolourSpriteBackdrop(photoSprite(), '#ff0088');
    const palette = parseAvatarSprite(String(recoloured))?.palette ?? {};

    expect(Object.values(palette)).toEqual([
      '#112233',
      '#445566',
      '#778899',
      '#ff0088',
      '#000000',
    ]);
  });

  it('leaves the pixels untouched, so the picture is the same picture', () => {
    const before = parseAvatarSprite(photoSprite())?.rows;
    const after = parseAvatarSprite(String(recolourSpriteBackdrop(photoSprite(), '#ff0088')))?.rows;

    expect(after).toEqual(before);
  });

  it('accepts a bare hex as readily as a hashed one, since both are in use', () => {
    expect(recolourSpriteBackdrop(photoSprite(), 'FF0088')).toBe(
      recolourSpriteBackdrop(photoSprite(), '#ff0088'),
    );
  });

  it('refuses a sprite it cannot parse rather than handing back something broken', () => {
    expect(recolourSpriteBackdrop('not a sprite', '#ff0088')).toBeNull();
    expect(recolourSpriteBackdrop('', '#ff0088')).toBeNull();
  });

  it('refuses a colour that would not survive a round trip', () => {
    // A malformed swatch must not be allowed to corrupt a stored avatar.
    expect(recolourSpriteBackdrop(photoSprite(), 'nothex')).toBeNull();
  });
});
