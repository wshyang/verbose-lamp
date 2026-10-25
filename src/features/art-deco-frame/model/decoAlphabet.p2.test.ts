// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';

import { DECO_ALPHABET } from './decoAlphabet';

function recordingPath() {
  return {
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
  };
}
describe('DECO_ALPHABET', () => {
  it('defines positive widths and drawable paths for every glyph', () => {
    const entries = Object.entries(DECO_ALPHABET);
    const glyphs = entries.map(([glyph]) => glyph).join('');
    expect(glyphs).toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(glyphs).toContain('0123456789');
    for (const [glyph, def] of entries) {
      const path = recordingPath();
      def.build(path as unknown as Path2D, 40, 80);
      const commands = path.moveTo.mock.calls.length
        + path.lineTo.mock.calls.length
        + path.arc.mock.calls.length
        + path.closePath.mock.calls.length;
      expect(def.w, glyph).toBeGreaterThan(0);
      expect(commands, glyph).toBeGreaterThan(0);
      for (const call of [...path.moveTo.mock.calls, ...path.lineTo.mock.calls]) {
        expect(Number.isFinite(call[0]), glyph).toBe(true);
        expect(Number.isFinite(call[1]), glyph).toBe(true);
      }
    }
  });

  it('keeps signature G and Q spurs inside their designed overshoot', () => {
    const g = recordingPath();
    DECO_ALPHABET.G.build(g as unknown as Path2D, 58, 100);
    expect(g.lineTo).toHaveBeenCalledWith(26.68, 54);
    const q = recordingPath();
    DECO_ALPHABET.Q.build(q as unknown as Path2D, 62, 100);
    expect(q.lineTo).toHaveBeenLastCalledWith(64.48, 104);
  });
});
