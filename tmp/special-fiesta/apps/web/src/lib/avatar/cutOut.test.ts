import { describe, expect, it } from 'vitest';
import {
  componentSizesOf,
  DEFAULT_TUNING,
  keepEverything,
  maskFromModel,
  pruneIslands,
  trimEdge,
  tunedMask,
  withBackground,
  withKnob,
} from './cutOut.js';
import type { SubjectMask } from './types.js';

/**
 * ADR-072 — the tests that matter for the blob beside somebody's head.
 *
 * These use small hand-built grids rather than photographs on purpose: the bug was a question about
 * *shape*, and a 16×16 grid with a planted island states the question exactly. The e2e suite cannot
 * — its stand-in mask is a single ellipse, which has no detached pieces to drop.
 *
 * `SIZE` is 16 so the seed cell `mainComponent` looks at — round(size × 0.52) × size + round(size/2)
 * — is (8, 8), which every fixture below is drawn around.
 */
const SIZE = 16;
const SEED = { x: 8, y: 8 };

/** A background mask (1 = background) with the given inclusive rectangles cut out as subject. */
function gridOf(rectangles: Array<[number, number, number, number]>): Uint8Array {
  const background = new Uint8Array(SIZE * SIZE).fill(1);
  for (const [x0, y0, x1, y1] of rectangles) {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) background[y * SIZE + x] = 0;
    }
  }
  return background;
}

const subjectCells = (mask: Uint8Array): number =>
  mask.reduce((total, value) => total + (value === 0 ? 1 : 0), 0);

const isSubject = (mask: Uint8Array, x: number, y: number): boolean => mask[y * SIZE + x] === 0;

function flatMask(alpha: number): SubjectMask {
  return { width: 8, height: 8, alpha: new Uint8Array(8 * 8).fill(alpha) };
}

describe('maskFromModel', () => {
  const box = { x: 0, y: 0, size: 8 };

  it('calls a cell background when the matte behind it is below the threshold', () => {
    const background = maskFromModel(flatMask(100), box, { size: 8, threshold: 128 });

    expect(subjectCells(background)).toBe(0);
  });

  it('calls the same cell subject once the threshold drops below the matte', () => {
    const background = maskFromModel(flatMask(100), box, { size: 8, threshold: 80 });

    expect(background.every((value) => value === 0)).toBe(true);
  });

  it('treats the threshold as exclusive, so alpha exactly at it is kept', () => {
    const background = maskFromModel(flatMask(128), box, { size: 8, threshold: 128 });

    expect(background.every((value) => value === 0)).toBe(true);
  });
});

describe('trimEdge', () => {
  it('changes nothing at zero', () => {
    const before = gridOf([[6, 6, 11, 11]]);

    expect([...trimEdge(before, SIZE, 0)]).toEqual([...before]);
  });

  it('shrinks the subject by a cell on a negative trim', () => {
    // A 6×6 block eroded by one becomes the 4×4 block inside it.
    const trimmed = trimEdge(gridOf([[6, 6, 11, 11]]), SIZE, -1);

    expect(subjectCells(trimmed)).toBe(16);
    expect(isSubject(trimmed, 7, 7)).toBe(true);
    expect(isSubject(trimmed, 6, 6)).toBe(false);
  });

  it('grows the subject by a cell on a positive trim', () => {
    const grown = trimEdge(gridOf([[6, 6, 11, 11]]), SIZE, 1);

    expect(subjectCells(grown)).toBe(36 + 24);
    expect(isSubject(grown, 5, 6)).toBe(true);
  });

  it('never moves the edge by more than two cells, however far it is asked', () => {
    const asked = trimEdge(gridOf([[4, 4, 11, 11]]), SIZE, -9);
    const capped = trimEdge(gridOf([[4, 4, 11, 11]]), SIZE, -2);

    expect([...asked]).toEqual([...capped]);
  });

  it('leaves the source mask alone', () => {
    const before = gridOf([[6, 6, 11, 11]]);
    const copy = [...before];
    trimEdge(before, SIZE, -1);

    expect([...before]).toEqual(copy);
  });
});

describe('pruneIslands', () => {
  /** A 6×6 subject around the seed, plus a 2×2 lump in the corner with no path to it. */
  const withIsland = () =>
    gridOf([
      [6, 6, 11, 11],
      [0, 0, 1, 1],
    ]);

  it('drops a detached piece and keeps the one the face is in', () => {
    const pruned = pruneIslands(withIsland(), SIZE, DEFAULT_TUNING.minIsland);

    expect(subjectCells(pruned)).toBe(36);
    expect(isSubject(pruned, SEED.x, SEED.y)).toBe(true);
    expect(isSubject(pruned, 0, 0)).toBe(false);
  });

  it('keeps every piece when asked for none', () => {
    const pruned = pruneIslands(withIsland(), SIZE, 0);

    expect(subjectCells(pruned)).toBe(40);
    expect(isSubject(pruned, 0, 0)).toBe(true);
  });

  it('keeps a detached piece that is bigger than the limit', () => {
    const pruned = pruneIslands(withIsland(), SIZE, 3);

    expect(subjectCells(pruned)).toBe(40);
  });

  /*
   * The case that would have shipped a blank avatar. One participant in the recorded crowd placed
   * the square by hand with their face low and left, so the seed cell holds no subject at all. The
   * largest piece has to win there, or pruning deletes the person.
   */
  it('falls back to the largest piece when the face cell is not subject', () => {
    const offCentre = gridOf([
      [0, 0, 4, 4],
      [13, 13, 15, 15],
    ]);
    expect(isSubject(offCentre, SEED.x, SEED.y)).toBe(false);

    const pruned = pruneIslands(offCentre, SIZE, DEFAULT_TUNING.minIsland);

    expect(subjectCells(pruned)).toBe(25);
    expect(isSubject(pruned, 0, 0)).toBe(true);
    expect(isSubject(pruned, 15, 15)).toBe(false);
  });

  it('leaves a mask with no subject at all alone rather than throwing', () => {
    const empty = gridOf([]);

    expect([...pruneIslands(empty, SIZE, DEFAULT_TUNING.minIsland)]).toEqual([...empty]);
  });
});

describe('tunedMask', () => {
  /*
   * Why the order is threshold → trim → prune. Two blocks joined by a one-cell bridge are a single
   * piece until the edge is trimmed; trimming severs the bridge, and the offcut then deserves the
   * same judgement the original islands got. Pruning first would hand erosion a clean grid and
   * never look again.
   */
  const bridged = () =>
    gridOf([
      [6, 6, 11, 11],
      [0, 7, 2, 9],
      [3, 8, 5, 8],
    ]);

  it('keeps a bridged shape whole while the bridge survives', () => {
    const mask = tunedMask(bridged(), SIZE, { ...DEFAULT_TUNING, edge: 0 });

    expect(subjectCells(mask)).toBe(36 + 9 + 3);
  });

  it('prunes the offcut that trimming created', () => {
    const mask = tunedMask(bridged(), SIZE, { ...DEFAULT_TUNING, edge: -1 });

    /*
     * The 6×6 erodes to the 4×4 around the seed, plus the one cell at (6, 8) that the bridge was
     * still feeding when erosion looked — 17 cells, all one piece. The far block erodes to a
     * two-cell remnant with nothing joining it to anything, and that is what pruning takes.
     */
    expect(subjectCells(mask)).toBe(17);
    expect(isSubject(mask, SEED.x, SEED.y)).toBe(true);
    expect(isSubject(mask, 6, 8)).toBe(true);
    expect(isSubject(mask, 0, 8)).toBe(false);
    expect(isSubject(mask, 1, 8)).toBe(false);
  });

  it('is the identity when nothing is asked of it', () => {
    const before = bridged();
    const mask = tunedMask(before, SIZE, { ...DEFAULT_TUNING, minIsland: 0 });

    expect([...mask]).toEqual([...before]);
  });
});

describe('withBackground and keepEverything', () => {
  it('starts with the cut-out on', () => {
    expect(DEFAULT_TUNING.removeBackground).toBe(true);
  });

  it('turns the cut-out off without disturbing the numbers', () => {
    const off = withBackground(DEFAULT_TUNING, { on: false });

    expect(off.removeBackground).toBe(false);
    expect(off.threshold).toBe(DEFAULT_TUNING.threshold);
    expect(off.minIsland).toBe(DEFAULT_TUNING.minIsland);
    expect(off.edge).toBe(DEFAULT_TUNING.edge);
  });

  it('turns it back on again', () => {
    const off = withBackground(DEFAULT_TUNING, { on: false });

    expect(withBackground(off, { on: true })).toEqual(DEFAULT_TUNING);
  });

  it('calls every cell the person', () => {
    const mask = keepEverything(SIZE);

    expect(mask.length).toBe(SIZE * SIZE);
    expect(subjectCells(mask)).toBe(SIZE * SIZE);
    expect(componentSizesOf(mask, SIZE)).toEqual([SIZE * SIZE]);
  });
});

describe('withKnob', () => {
  it('clamps each knob to its own bounds', () => {
    expect(withKnob(DEFAULT_TUNING, { knob: 'threshold', value: 999 }).threshold).toBe(240);
    expect(withKnob(DEFAULT_TUNING, { knob: 'threshold', value: -5 }).threshold).toBe(16);
    expect(withKnob(DEFAULT_TUNING, { knob: 'edge', value: -9 }).edge).toBe(-2);
    expect(withKnob(DEFAULT_TUNING, { knob: 'minIsland', value: -1 }).minIsland).toBe(0);
  });

  it('rounds a slider that hands back a fraction', () => {
    expect(withKnob(DEFAULT_TUNING, { knob: 'threshold', value: 140.6 }).threshold).toBe(141);
  });

  it('leaves the other two knobs alone', () => {
    const next = withKnob(DEFAULT_TUNING, { knob: 'edge', value: 1 });

    expect(next).toEqual({ ...DEFAULT_TUNING, edge: 1 });
  });
});
