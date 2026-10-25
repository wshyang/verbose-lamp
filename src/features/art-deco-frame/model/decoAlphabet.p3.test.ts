// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { DECO_ALPHABET } from './decoAlphabet';

class RecordingPath_p3 {
  readonly commands: string[] = [];
  moveTo(x: number, y: number) { this.commands.push(`M${x},${y}`); }
  lineTo(x: number, y: number) { this.commands.push(`L${x},${y}`); }
  arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean) {
    this.commands.push(`A${x},${y},${r},${start},${end},${ccw ? 1 : 0}`);
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.commands.push(`B${a},${b},${c},${d},${e},${f}`);
  }
  quadraticCurveTo(a: number, b: number, c: number, d: number) {
    this.commands.push(`Q${a},${b},${c},${d}`);
  }
  closePath() { this.commands.push('Z'); }
  rect(x: number, y: number, w: number, h: number) { this.commands.push(`R${x},${y},${w},${h}`); }
  ellipse(x: number, y: number, rx: number, ry: number) { this.commands.push(`E${x},${y},${rx},${ry}`); }
}
const glyphs = Object.entries(DECO_ALPHABET);
describe('DECO_ALPHABET', () => {
  it('covers the full uppercase alphabet plus punctuation and digits', () => {
    const letters = glyphs.filter(([glyph]) => /[A-Z]/.test(glyph)).map(([glyph]) => glyph);
    expect(letters).toHaveLength(26);
    expect(Object.keys(DECO_ALPHABET)).toContain('&');
    expect(Object.keys(DECO_ALPHABET)).toEqual(expect.arrayContaining(['.', '·', '-', "'", '0', '9']));
  });

  it.each(glyphs)('draws %s inside its own advance width', (_char, def) => {
    const path = new RecordingPath_p3();
    def.build(path as unknown as Path2D, def.w * 220, 220);

    expect(def.w).toBeGreaterThan(0);
    expect(def.w).toBeLessThanOrEqual(1.2);
    expect(path.commands.length).toBeGreaterThan(0);

    const numbers = path.commands.flatMap((command) =>
      command.slice(1).split(',').map((value) => Number(value)),
    );
    expect(numbers.every((value) => Number.isFinite(value))).toBe(true);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(220.01 * def.w + 220.01);
  });

  it('is deterministic for a scaled glyph', () => {
    const drawAt = (scale: number) => {
      const path = new RecordingPath_p3();
      DECO_ALPHABET.G.build(path as unknown as Path2D, DECO_ALPHABET.G.w * scale, scale);
      return path.commands;
    };
    expect(drawAt(220)).toEqual(drawAt(220));
    expect(drawAt(220)).not.toEqual(drawAt(110));
  });
});
