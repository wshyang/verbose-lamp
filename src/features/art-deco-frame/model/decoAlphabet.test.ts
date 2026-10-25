import { describe, expect, it } from 'vitest';
import { DECO_ALPHABET } from './decoAlphabet';

/** Records the Path2D calls a glyph skeleton makes, so geometry is tested as data. */
class RecordingPath {
  readonly ops: Array<{ op: string; args: number[] }> = [];
  moveTo(x: number, y: number) {
    this.ops.push({ op: 'moveTo', args: [x, y] });
  }
  lineTo(x: number, y: number) {
    this.ops.push({ op: 'lineTo', args: [x, y] });
  }
  arc(x: number, y: number, r: number, start: number, end: number) {
    this.ops.push({ op: 'arc', args: [x, y, r, start, end] });
  }
  closePath() {
    this.ops.push({ op: 'closePath', args: [] });
  }
}

function traceGlyph(glyph: string): RecordingPath {
  const def = DECO_ALPHABET[glyph];
  const path = new RecordingPath();
  def.build(path as unknown as Path2D, def.w * 100, 100);
  return path;
}

describe('DECO_ALPHABET', () => {
  it('covers the full latin alphabet and digits', () => {
    for (const glyph of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      expect(DECO_ALPHABET[glyph], glyph).toBeDefined();
    }
  });

  it('every glyph traces finite geometry with a plausible advance width', () => {
    for (const [glyph, def] of Object.entries(DECO_ALPHABET)) {
      const path = traceGlyph(glyph);
      expect(path.ops.length, glyph).toBeGreaterThan(0);
      // Most glyphs open with moveTo; a few (e.g. '2') open directly with an arc.
      expect(['moveTo', 'arc'], glyph).toContain(path.ops[0].op);
      for (const { args } of path.ops) {
        for (const value of args) expect(Number.isFinite(value), glyph).toBe(true);
      }
      expect(def.w, glyph).toBeGreaterThan(0);
      expect(def.w, glyph).toBeLessThanOrEqual(1.2);
    }
  });

  it('A carries the signature low Deco crossbar', () => {
    expect(traceGlyph('A').ops.map((o) => o.op)).toEqual([
      'moveTo',
      'lineTo',
      'lineTo',
      'moveTo',
      'lineTo',
    ]);
  });
});
