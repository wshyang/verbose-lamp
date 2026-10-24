import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from './cutOut.js';
import type { Candidate, TuningChoice } from './cutOutScore.js';
import {
  ambiguityOf,
  chooseTuning,
  enclosedHoles,
  faceSeed,
  plateauOf,
  scoreSettings,
} from './cutOutScore.js';
import type { SubjectMask } from './types.js';

/**
 * The scorer, tested against mattes built to contain exactly one named failure each.
 *
 * These are synthetic on purpose and the limitation is real: a synthetic matte can show that a
 * metric responds to the thing it names, and it cannot say what the thresholds should be. That
 * second job belongs to the recorded demo crowd and is written down as unfinished in
 * `docs/design/cutout-auto-tuning-assessment.md` §7 rather than papered over here.
 *
 * The fixtures are photograph-shaped (478 × 640, a soft-edged person roughly centred) because the
 * crop box and the face seed both assume it. An earlier version of this probe put its ambiguous
 * patch at y 400–520, outside the 478-pixel crop box, and read zero holes — which looked exactly
 * like a metric that does not work. Every fixture below is asserted to land inside the box.
 */

const WIDTH = 478;
const HEIGHT = 640;
const SIZE = 64;
const BOX = { x: 0, y: 0, size: Math.min(WIDTH, HEIGHT) };

interface MatteOptions {
  /** A second person, detached, as MODNET really does return them. */
  bystander?: boolean;
  /** Alpha of a torso-sized patch the model is unsure about — a shirt the colour of the wall. */
  torsoAlpha?: number;
  /** Nothing is subject at all. */
  empty?: boolean;
}

function matte(options: MatteOptions = {}): SubjectMask {
  const alpha = new Uint8Array(WIDTH * HEIGHT);
  if (options.empty === true) return { width: WIDTH, height: HEIGHT, alpha };
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const dx = (x - WIDTH * 0.5) / (WIDTH * 0.3);
      const dy = (y - HEIGHT * 0.55) / (HEIGHT * 0.42);
      const edge = (1.15 - Math.hypot(dx, dy)) / 0.3;
      alpha[y * WIDTH + x] = Math.round(255 * Math.max(0, Math.min(1, edge)));
    }
  }
  if (options.bystander === true) {
    for (let y = 100; y < 190; y += 1) for (let x = 20; x < 90; x += 1) alpha[y * WIDTH + x] = 240;
  }
  if (options.torsoAlpha !== undefined) {
    const value = options.torsoAlpha;
    for (let y = 250; y < 340; y += 1) for (let x = 190; x < 300; x += 1) alpha[y * WIDTH + x] = value;
  }
  return { width: WIDTH, height: HEIGHT, alpha };
}

const highest = (values: number[]): number => values.reduce((top, one) => Math.max(top, one), 0);

describe('the fixtures themselves', () => {
  it('puts the ambiguous patch inside the crop box, which is how the first version of this failed', () => {
    expect(340).toBeLessThan(BOX.y + BOX.size);
    expect(300).toBeLessThan(BOX.x + BOX.size);
  });
});

describe('enclosedHoles', () => {
  it('counts background with no path to the border and ignores background that has one', () => {
    const ring = new Uint8Array(SIZE * SIZE).fill(1);
    for (let y = 10; y < 30; y += 1) for (let x = 10; x < 30; x += 1) ring[y * SIZE + x] = 0;
    for (let y = 15; y < 20; y += 1) for (let x = 15; x < 20; x += 1) ring[y * SIZE + x] = 1;
    expect(enclosedHoles(ring, SIZE)).toBe(25);
  });

  it('is zero when every cell is background', () => {
    expect(enclosedHoles(new Uint8Array(SIZE * SIZE).fill(1), SIZE)).toBe(0);
  });
});

describe('scoreSettings on a clean matte', () => {
  const candidates = scoreSettings(matte(), BOX, SIZE);

  it('finds no holes at any setting', () => {
    expect(highest(candidates.map((one) => one.holes))).toBe(0);
  });

  it('refuses nothing', () => {
    expect(candidates.filter((one) => one.refused !== null)).toEqual([]);
  });

  it('keeps the subject in one piece', () => {
    expect(highest(candidates.map((one) => one.pieces))).toBe(1);
  });
});

describe('the bystander, which is the trap', () => {
  const candidates = scoreSettings(matte({ bystander: true }), BOX, SIZE);
  const pruning = candidates.filter((one) => one.tuning.minIsland > 0);

  /**
   * The claim is comparative, and it has to be: at a tight threshold the subject's own edge erodes
   * and that bite is real. What must never happen is pruning the stranger *adding* any. Scoring
   * the whole matte instead of the face-connected piece made this difference ~4 %, and a tuner
   * minimising it would have learned to keep every bystander in the frame.
   */
  it('does not score pruning a second person as damage to the first', () => {
    expect(pruning).not.toHaveLength(0);
    for (const removed of pruning) {
      const kept = candidates.find(
        (one) =>
          one.tuning.minIsland === 0 &&
          one.tuning.threshold === removed.tuning.threshold &&
          one.tuning.edge === removed.tuning.edge,
      );
      expect(removed.bite).toBe(kept?.bite);
    }
  });

  it('still sees the extra piece when the setting keeps it', () => {
    const keeping = candidates.filter((one) => one.tuning.minIsland === 0);
    expect(highest(keeping.map((one) => one.pieces))).toBe(2);
  });
});

describe('a region the model is unsure about', () => {
  const candidates = scoreSettings(matte({ torsoAlpha: 105 }), BOX, SIZE);
  const holesAt = (threshold: number): number =>
    highest(candidates.filter((one) => one.tuning.threshold === threshold).map((one) => one.holes));

  it('perforates the subject as the threshold tightens', () => {
    expect(holesAt(96)).toBe(0);
    expect(holesAt(112)).toBeGreaterThan(0);
    expect(holesAt(176)).toBeGreaterThan(holesAt(112));
  });

  it('is chosen away from: the pick is looser than the current default', () => {
    expect(chooseTuning(matte({ torsoAlpha: 105 }), BOX, SIZE).tuning.threshold).toBeLessThan(
      DEFAULT_TUNING.threshold,
    );
  });
});

describe('chooseTuning', () => {
  it('leaves a clean photograph on a setting the participant can reach by tapping', () => {
    const { tuning } = chooseTuning(matte(), BOX, SIZE);
    expect([80, 128, 176]).toContain(tuning.threshold);
    expect(tuning.removeBackground).toBe(true);
  });

  /**
   * The regression that justifies the third sort key. Bite and leak are both zero everywhere on a
   * clean matte, so without a tie-break the winner was whichever setting the loops emitted first —
   * `Trim` — and the chooser shaved a cell off every well-photographed participant while reporting
   * a perfect score. A chooser that moves a good photograph is worse than no chooser at all.
   */
  it('does not move a photograph that has nothing wrong with it', () => {
    expect(chooseTuning(matte(), BOX, SIZE).tuning).toEqual(DEFAULT_TUNING);
  });

  it('moves only towards looser, never tighter, when a region is ambiguous', () => {
    const choice = chooseTuning(matte({ torsoAlpha: 105 }), BOX, SIZE);
    expect(choice.tuning.threshold).toBe(80);
    expect(choice.tuning.edge).toBe(DEFAULT_TUNING.edge);
  });

  it('reaches for ADR-077 and keeps the photograph when every setting is refused', () => {
    const choice = chooseTuning(matte({ empty: true }), BOX, SIZE);
    expect(choice.tuning.removeBackground).toBe(false);
    expect(choice.why).toContain('keeping the photograph whole');
  });

  it('reports how much of the matte sits in neither confident band', () => {
    expect(chooseTuning(matte(), BOX, SIZE).ambiguity).toBeLessThan(0.2);
    expect(chooseTuning(matte({ torsoAlpha: 105 }), BOX, SIZE).ambiguity).toBeGreaterThan(
      chooseTuning(matte(), BOX, SIZE).ambiguity,
    );
  });

  it('returns every candidate it looked at, so a report can show the working', () => {
    expect(chooseTuning(matte(), BOX, SIZE).candidates).toHaveLength(11 * 2 * 3);
  });
});

describe('ambiguityOf', () => {
  it('is one when the whole crop is in the middle band', () => {
    const alpha = new Uint8Array(WIDTH * HEIGHT).fill(128);
    expect(ambiguityOf({ width: WIDTH, height: HEIGHT, alpha }, BOX)).toBe(1);
  });

  it('is zero when the matte has made up its mind everywhere', () => {
    const alpha = new Uint8Array(WIDTH * HEIGHT).fill(255);
    expect(ambiguityOf({ width: WIDTH, height: HEIGHT, alpha }, BOX)).toBe(0);
  });

  it('accepts a fractional crop box, which is what a face locator really produces (ADR-221)', () => {
    // locateFace.ts builds its box from eye-distance arithmetic and never rounds, so every real
    // box is fractional. This used to index the alpha plane with 12.4 and throw "Missing matte
    // alpha". Watched to fail by taking the Math.round calls out of ambiguityOf.
    const alpha = new Uint8Array(WIDTH * HEIGHT).fill(128);
    const box = { x: 12.4, y: 7.8, size: 301.5 };
    expect(ambiguityOf({ width: WIDTH, height: HEIGHT, alpha }, box)).toBe(1);
  });

  it('clamps a fractional box that rounds past the edge of the matte (ADR-221)', () => {
    const alpha = new Uint8Array(WIDTH * HEIGHT).fill(128);
    const box = { x: WIDTH - 10.4, y: HEIGHT - 10.6, size: 40.5 };
    expect(ambiguityOf({ width: WIDTH, height: HEIGHT, alpha }, box)).toBe(1);
  });
});

describe('faceSeed', () => {
  it('is the cell between the eyes that pruneIslands already seeds from', () => {
    expect(faceSeed(64)).toBe(Math.round(64 * 0.52) * 64 + 32);
  });
});

describe('plateauOf', () => {
  const at = (threshold: number, bite: number): Candidate => ({
    tuning: { removeBackground: true, threshold, minIsland: 512, edge: 0 },
    main: 1000,
    pieces: 1,
    holes: 0,
    bite,
    leak: 0,
    faceIntact: true,
    refused: null,
  });

  it('takes the centre of the widest run, not the first setting that ties', () => {
    const leader = at(48, 0);
    const line = [leader, at(64, 0), at(80, 0.5), at(96, 0), at(112, 0), at(128, 0)];
    expect(plateauOf(line, leader).tuning.threshold).toBe(112);
  });

  it('falls back to the leader when it is the only acceptable setting', () => {
    const leader = at(128, 0);
    expect(plateauOf([leader, at(48, 0.5)], leader).tuning.threshold).toBe(128);
  });
});

describe('the degenerate mattes', () => {
  it('reports no leak when the matte calls the whole crop subject', () => {
    const alpha = new Uint8Array(WIDTH * HEIGHT).fill(255);
    const candidates = scoreSettings({ width: WIDTH, height: HEIGHT, alpha }, BOX, SIZE);
    expect(highest(candidates.map((one) => one.leak))).toBe(0);
  });

  it('reports no ambiguity for a crop box with no area', () => {
    expect(ambiguityOf(matte(), { x: 0, y: 0, size: 0 })).toBe(0);
  });
});

/*
 * Known defects, recorded as expected failures (`it.fails`). Each one passes while its defect is
 * present and turns red the moment the defect is fixed; that red is the signal to flip it to `it`,
 * which then stands as the regression test. Each has ordinary precondition tests in front of it, so
 * a fixture that drifts is red for its own reason rather than silently green.
 *
 * The fixtures are synthetic, like everything above. The mechanisms are the ones criterion 2 of the
 * gate (ADR-215) and the headless screen would meet on real photographs. Fixing them is a decision,
 * not a refactor, and none is made here. Recorded for the ADR-212 handoff, 2026-10-08.
 */

/** The swept candidate the returned tuning names: same threshold, minimum island and edge. */
const settingOf = (choice: TuningChoice): Candidate | undefined =>
  choice.candidates.find(
    (one) =>
      one.tuning.threshold === choice.tuning.threshold &&
      one.tuning.minIsland === choice.tuning.minIsland &&
      one.tuning.edge === choice.tuning.edge,
  );

/** The swept candidate at the opening setting, `DEFAULT_TUNING`. */
const atDefault = (candidates: Candidate[]): Candidate | undefined =>
  candidates.find(
    (one) =>
      one.tuning.threshold === DEFAULT_TUNING.threshold &&
      one.tuning.minIsland === DEFAULT_TUNING.minIsland &&
      one.tuning.edge === DEFAULT_TUNING.edge,
  );

describe('fixtures behind the known defects', () => {
  it('torso alpha 150: the opening setting does no measurable damage', () => {
    expect(atDefault(scoreSettings(matte({ torsoAlpha: 150 }), BOX, SIZE))).toMatchObject({
      holes: 0,
      bite: 0,
      refused: null,
    });
  });

  it('torso alpha 60: the opening setting is refused, and so is threshold 80', () => {
    const candidates = scoreSettings(matte({ torsoAlpha: 60 }), BOX, SIZE);
    expect(atDefault(candidates)?.refused ?? null).not.toBeNull();
    const eighty = candidates.find(
      (one) =>
        one.tuning.threshold === 80 &&
        one.tuning.minIsland === DEFAULT_TUNING.minIsland &&
        one.tuning.edge === DEFAULT_TUNING.edge,
    );
    expect(eighty?.refused ?? null).not.toBeNull();
  });

  it('torso alpha 60: some setting survives the sweep, so the chooser has an answer', () => {
    const candidates = scoreSettings(matte({ torsoAlpha: 60 }), BOX, SIZE);
    expect(candidates.some((one) => one.refused === null)).toBe(true);
  });

  it('the chooser answers with a setting the sweep actually scored', () => {
    expect(settingOf(chooseTuning(matte({ torsoAlpha: 150 }), BOX, SIZE))).toBeDefined();
    expect(settingOf(chooseTuning(matte({ torsoAlpha: 60 }), BOX, SIZE))).toBeDefined();
  });
});

describe('known defects (expected failures)', () => {
  /**
   * D1 — criterion 2's failure, on a matte. The opening setting already keeps the torso with no
   * hole and no bite, yet the chooser moves to threshold 80: the plateau's centre is 96, which
   * snaps to 80. Moving a photograph the default handles cleanly is the one thing the chooser must
   * not do.
   */
  it.fails('D1 — does not move a setting that does no measurable damage (torso alpha 150)', () => {
    expect(chooseTuning(matte({ torsoAlpha: 150 }), BOX, SIZE).tuning).toEqual(DEFAULT_TUNING);
  });

  /**
   * D2 — the snap after the plateau puts the threshold on 80 without re-checking refusal. At 80
   * the scorer refuses the setting: the face is lost, with 154 enclosed holes. No criterion of the
   * six reads `refused`, and criterion 4 still passes, because 154 is below the opening setting's
   * 168.
   */
  it.fails('D2 — never returns a setting the scorer refuses (torso alpha 60)', () => {
    const choice = chooseTuning(matte({ torsoAlpha: 60 }), BOX, SIZE);
    expect(settingOf(choice)?.refused ?? null).toBeNull();
  });

  /**
   * D3 — `why` is built from the unsnapped candidate, so it describes a different setting from
   * the one returned whenever the snap moves the threshold. Here it reports threshold 48's numbers
   * while returning 80, whose 154 holes are the ones the participant would get.
   */
  it.fails('D3 — the reason line describes the setting it returns (torso alpha 60)', () => {
    const choice = chooseTuning(matte({ torsoAlpha: 60 }), BOX, SIZE);
    expect(choice.why).toMatch(new RegExp(`\\b${settingOf(choice)?.holes} holes\\b`));
  });
});
