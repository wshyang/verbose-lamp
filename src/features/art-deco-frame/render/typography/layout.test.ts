import { describe, expect, it } from 'vitest';
import { DECO_ALPHABET } from '../../model/decoAlphabet';
import { CAP_HEIGHT, PAD_X, PAD_Y, layoutGlyphs, strokeFor } from './layout';

/**
 * Where each glyph sits and how big the canvas is. Positions are derived here from the alphabet's own
 * glyph widths, the cap height and the tracking, not copied from the function's output, so a
 * change to the spacing arithmetic fails against an independent calculation.
 */
const width = (ch: string) => DECO_ALPHABET[ch].w * CAP_HEIGHT;
const layout = (text: string, extra: Partial<Parameters<typeof layoutGlyphs>[0]> = {}) =>
  layoutGlyphs({ text, worldHeight: 1, ...extra });

describe('strokeFor', () => {
  it('cuts the hero face heaviest and the fine face lightest', () => {
    expect([strokeFor('hero'), strokeFor('regular'), strokeFor('fine')]).toEqual([32, 24, 18]);
  });

  it('defaults to the hero weight', () => {
    expect(strokeFor(undefined)).toBe(32);
    expect(strokeFor()).toBe(32);
  });
});

describe('glyph placement', () => {
  it('starts the first glyph at zero and advances by its width plus the tracking', () => {
    const { placements } = layout('GA');

    expect(placements[0].x).toBe(0);
    expect(placements[1].x).toBeCloseTo(width('G') + CAP_HEIGHT * 0.18, 9);
  });

  it('uses the lighter-weight tracking of 0.24 for regular and fine type', () => {
    for (const weight of ['regular', 'fine'] as const) {
      expect(layout('GA', { weight }).placements[1].x).toBeCloseTo(width('G') + CAP_HEIGHT * 0.24, 9);
    }
  });

  it('lets an explicit tracking override the weight default', () => {
    expect(layout('GA', { tracking: 0.5 }).placements[1].x).toBeCloseTo(width('G') + CAP_HEIGHT * 0.5, 9);
    expect(layout('GA', { tracking: 0, weight: 'fine' }).placements[1].x).toBeCloseTo(width('G'), 9);
  });

  it('upper-cases the text before looking glyphs up', () => {
    expect(layout('gatsby').placements.map((p) => p.ch).join('')).toBe('GATSBY');
  });

  it('advances a space by 0.36 of the cap height without placing a glyph', () => {
    const spaced = layout('G A').placements;
    const tight = layout('GA').placements;

    expect(spaced).toHaveLength(2);
    expect(spaced[1].x - tight[1].x).toBeCloseTo(CAP_HEIGHT * 0.36, 9);
  });

  it('falls back to the O skeleton for a character the alphabet lacks', () => {
    const [unknown] = layout('€').placements;

    expect(unknown.ch).toBe('€');
    expect(unknown.glyphW).toBeCloseTo(width('O'), 9);
    expect(unknown.def).toBe(DECO_ALPHABET['O']);
  });
});

describe('pinstripe alternation', () => {
  const stripes = (text: string, extra = {}) => layout(text, extra).placements.map((p) => p.pinstriped);

  it('pinstripes every other letter, starting with the first', () => {
    expect(stripes('ABCD')).toEqual([true, false, true, false]);
  });

  it('turns it off entirely when asked', () => {
    expect(stripes('ABCD', { alternatePinstripes: false })).toEqual([false, false, false, false]);
  });

  it('skips punctuation and the letter I and the digit 1, and does not count them', () => {
    // A is visible #0 (striped), '.' is skipped, B is visible #1 (solid), '-' skipped, C is #2 (striped).
    expect(stripes('A.B-C')).toEqual([true, false, false, false, true]);
    expect(stripes('I1AB')).toEqual([false, false, true, false]);
  });

  it.each(['.', '·', '-', "'", 'I', '1'])('treats %s as punctuation: never striped, never counted', (mark) => {
    // 'A', the mark, 'B': if the mark counted, B would land on an even index and be striped.
    expect(stripes(`A${mark}B`)).toEqual([true, false, false]);
  });

  it('does not count a space either', () => {
    expect(stripes('A B')).toEqual(stripes('AB'));
  });
});

describe('canvas size', () => {
  it('is the run plus padding on each side, at the fixed height', () => {
    const l = layout('GA');
    const run = width('G') + CAP_HEIGHT * 0.18 + width('A');

    expect(l.runWidth).toBeCloseTo(run, 9);
    expect(l.canvasW).toBe(Math.ceil(run + PAD_X * 2));
    expect(l.canvasH).toBe(CAP_HEIGHT + PAD_Y * 2);
    expect(l.scaleFit).toBe(1);
  });

  it('trims the trailing tracking off the run', () => {
    const one = layout('G');

    expect(one.runWidth).toBeCloseTo(width('G'), 9);
  });

  it('never goes below 256 pixels wide', () => {
    expect(layout('G').canvasW).toBe(256);
  });

  it('gives empty and blank text a fixed half-cap run so it still has a canvas', () => {
    for (const text of ['', '   ']) {
      const l = layout(text);
      expect(l.placements).toEqual([]);
      expect(l.runWidth).toBe(CAP_HEIGHT * 0.5);
      expect(l.canvasW).toBe(256);
    }
  });

  it('caps the canvas at 2560 pixels and scales the run to fit', () => {
    const l = layout('M'.repeat(60));

    expect(l.canvasW).toBe(2560);
    expect(l.scaleFit).toBeCloseTo((2560 - PAD_X * 2) / l.runWidth, 9);
    expect(l.scaleFit).toBeLessThan(1);
    expect(l.runWidth * l.scaleFit + PAD_X * 2).toBeCloseTo(2560, 6);
  });

  // Pinned to the boundary exactly: 17 'A's at the tracking that makes the run 2448 pixels, so the run
  // plus its 112 pixels of padding is 2560. At the limit it fits; one pixel more and it scales.
  it('does not scale text that exactly fills the canvas, and scales text one pixel over', () => {
    const run = 2560 - PAD_X * 2;
    const tracking = (run - 17 * width('A')) / (16 * CAP_HEIGHT);
    const exact = layout('A'.repeat(17), { tracking });
    const over = layout('A'.repeat(17), { tracking: tracking + 1 / (16 * CAP_HEIGHT) });

    expect(exact.runWidth + PAD_X * 2).toBeCloseTo(2560, 6);
    expect(exact.scaleFit).toBe(1);
    expect(over.scaleFit).toBeLessThan(1);
  });

  it('carries the stroke weight for the glyphs it laid out', () => {
    expect(layout('G', { weight: 'fine' }).strokeW).toBe(18);
    expect(layout('G').strokeW).toBe(32);
  });
});
