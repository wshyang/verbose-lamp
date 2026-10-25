import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createRecordingPath, coordinates } from '@/test/path2d';
import { DECO_ALPHABET, type GlyphDef } from './decoAlphabet';

/**
 * The condensed deco alphabet is the typeface the whole film is set in, so its
 * skeletons are locked as geometry: every glyph is replayed into a recording
 * `Path2D` and hashed. A changed curve fails here, not in a screenshot
 * (ADDENDUM-029 §4).
 */
const CAP = 100;

function replay(def: GlyphDef, w = def.w * CAP, h = CAP): string[] {
  const { path, log } = createRecordingPath();
  def.build(path, w, h);
  return log;
}

function digest(log: readonly string[]): string {
  return createHash('sha1').update(log.join('\n')).digest('hex').slice(0, 12);
}

const GLYPHS = Object.keys(DECO_ALPHABET);

describe('DECO_ALPHABET', () => {
  it('covers the letters, digits and punctuation the titles need', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      expect(GLYPHS).toContain(ch);
    }
    for (const ch of ['.', '·', '-', "'", '&']) expect(GLYPHS).toContain(ch);
  });

  it('gives every glyph a positive width and at least one command', () => {
    for (const ch of GLYPHS) {
      expect(DECO_ALPHABET[ch].w, ch).toBeGreaterThan(0);
      expect(DECO_ALPHABET[ch].w, ch).toBeLessThanOrEqual(1);
      expect(replay(DECO_ALPHABET[ch]).length, ch).toBeGreaterThan(0);
    }
  });

  it('only emits finite coordinates inside a slightly padded box', () => {
    for (const ch of GLYPHS) {
      const values = coordinates(replay(DECO_ALPHABET[ch]));
      expect(values.length, ch).toBeGreaterThan(0);
      for (const value of values) {
        expect(Number.isFinite(value), `${ch}: ${value}`).toBe(true);
        expect(Math.abs(value), ch).toBeLessThanOrEqual(CAP * 3 + 1e-6);
      }
    }
  });

  /** Arc angles are absolute by design, so only positions and radii scale. */
  const POSITIONAL = /^(moveTo|lineTo|bezierCurveTo|quadraticCurveTo|rect)$/;

  it('scales positions linearly with the cap height, angles held absolute', () => {
    for (const ch of GLYPHS) {
      const def = DECO_ALPHABET[ch];
      const half = replay(def, def.w * 50, 50);
      const full = replay(def, def.w * 100, 100);
      expect(half, ch).toHaveLength(full.length);

      half.forEach((entry, index) => {
        const parsed = /^(\w+)\((.*)\)$/.exec(entry)!;
        const twin = /^(\w+)\((.*)\)$/.exec(full[index])!;
        expect(parsed[1], ch).toBe(twin[1]);
        const a = parsed[2].split(',').filter(Boolean).map(Number);
        const b = twin[2].split(',').filter(Boolean).map(Number);
        const positional = POSITIONAL.test(parsed[1]) ? a.length : 3; // arc: cx, cy, r
        a.forEach((value, arg) => {
          const expected = arg < positional ? b[arg] / 2 : b[arg];
          expect(value, `${ch} ${parsed[1]} arg ${arg}`).toBeCloseTo(expected, 6);
        });
      });
    }
  });

  it('draws arcs with a positive radius and a real sweep', () => {
    for (const ch of GLYPHS) {
      for (const entry of replay(DECO_ALPHABET[ch])) {
        if (!entry.startsWith('arc')) continue;
        const args = /\((.*)\)/.exec(entry)![1].split(',').filter(Boolean).map(Number);
        expect(args.length, ch).toBeGreaterThanOrEqual(5);
        expect(args[2], ch).toBeGreaterThan(0);
        expect(args[3], `${ch} start angle`).toBeGreaterThanOrEqual(-Math.PI * 2);
        expect(args[4], `${ch} end angle`).toBeLessThanOrEqual(Math.PI * 2);
      }
    }
  });

  it('closes the bowls it draws as closed outlines', () => {
    // O and Q are authored as closed outlines; the rest are stroked skeletons,
    // so a full 2π arc is enough for them and closing would mark a fill edge.
    for (const ch of ['O', 'Q']) expect(replay(DECO_ALPHABET[ch]), ch).toContain('closePath()');
    for (const ch of ['-', 'E', 'H', 'I', 'T', '7', '8', '9']) {
      expect(replay(DECO_ALPHABET[ch]), ch).not.toContain('closePath()');
    }
  });

  it('matches the locked skeleton of every glyph', () => {
    const locked = Object.fromEntries(GLYPHS.map((ch) => [ch, digest(replay(DECO_ALPHABET[ch]))]));
    expect(locked).toMatchSnapshot();
  });
});
