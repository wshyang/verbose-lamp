import { required } from '../required.js';
import type { CutOutTuning } from './cutOut.js';
import { CUT_OUT_STEPS, DEFAULT_TUNING, componentSizesOf, maskFromModel, tunedMask } from './cutOut.js';
import type { CropBox, SubjectMask } from './types.js';

/**
 * Scoring a cut-out without being told what the right answer is.
 *
 * `docs/design/cutout-auto-tuning-assessment.md` asked whether the settings in `cutOut.ts` could be
 * swept and the best one offered as the default, instead of a fixed `DEFAULT_TUNING` that sometimes
 * takes a chunk out of somebody's arm. Cost said yes easily — the matting model runs once and every
 * knob after it is a flood fill over 4,096 cells. This module is the part that was actually hard.
 *
 * Nothing here is wired to the studio. It is a measurement instrument first: run it over the
 * recorded demo crowd, compare what it picks against `DEFAULT_TUNING`, and only then decide whether
 * it chooses an initial value or merely raises a flag.
 *
 * TWO THINGS IT GETS RIGHT ON PURPOSE, BOTH OF WHICH THE OBVIOUS VERSION GETS WRONG.
 *
 * 1. *Damage is damage to the person, not to the matte.* MODNET mattes every person in the frame,
 *    so the stranger at the next table is confident subject too. Scoring "confident subject that
 *    the setting dropped" globally therefore reads ~7 % on every setting that prunes a bystander,
 *    and a tuner minimising it learns never to prune bystanders — it would make the product worse
 *    while reporting an improvement. Bite is measured inside the face-connected component only.
 *
 * 2. *The answer is a plateau, not an argmax.* There is no ground truth here, so the maximum of a
 *    hand-built score is a statement about the score rather than about the photograph. The centre
 *    of the widest run of thresholds that all behave acceptably is a claim about robustness, and it
 *    is insensitive to the arbitrary constants below in a way that an argmax is not.
 */

/** Alpha at or above this is subject and nobody disagrees. */
const CONFIDENT_SUBJECT = 224;
/** Alpha at or below this is background and nobody disagrees. */
const CONFIDENT_BACKGROUND = 32;

/**
 * Enclosed background cells tolerated before a setting is refused outright.
 *
 * PROVISIONAL, and the single number most in need of the demo crowd. On a synthetic matte the
 * count is 0 at every setting when the matte is clean and 108–220 when a region is ambiguous, so
 * anything in between separates them; this sits near the bottom of that gap because railings, a
 * hand on a hip and a gap between an arm and a torso are all real holes in a real photograph, and
 * a handful of them must not reject a setting that is otherwise fine.
 */
const HOLE_TOLERANCE = 16;

/**
 * Thresholds swept internally, denser than the three the participant is offered.
 *
 * The plateau in the doc cannot be seen through three samples. Each one costs ~0.5 ms, so density
 * here is close to free, and the winner is snapped back onto `CUT_OUT_STEPS.threshold` before it
 * leaves: a default the participant cannot reach by tapping is a default they cannot undo.
 */
const SWEPT_THRESHOLDS = [48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208];

export interface CutOutMetrics {
  /** Cells in the largest surviving piece. */
  main: number;
  /** How many pieces the subject came out in. */
  pieces: number;
  /** Background cells with no path to the frame border. People do not have holes. */
  holes: number;
  /** Confident-subject cells inside the person that this setting threw away, 0–1. */
  bite: number;
  /** Confident-background cells that this setting kept, 0–1. */
  leak: number;
  /** Whether the cells around the face seed survived. */
  faceIntact: boolean;
}

export interface Candidate extends CutOutMetrics {
  tuning: CutOutTuning;
  /** Why this setting is out of the running, or null if it is still in it. */
  refused: 'face' | 'holes' | null;
}

export interface TuningChoice {
  tuning: CutOutTuning;
  /** The one-line reason, for a report rather than for the participant. */
  why: string;
  /** Share of the crop's alpha sitting between the two confident bands, 0–1. */
  ambiguity: number;
  candidates: Candidate[];
}

interface Regions {
  /** Confident subject, reachable from the face seed. */
  person: Uint8Array;
  personCount: number;
  /** Confident background. */
  empty: Uint8Array;
  emptyCount: number;
}

const neighboursOf = (cell: number, size: number): number[] => {
  const x = cell % size;
  const y = (cell - x) / size;
  const out: number[] = [];
  if (x > 0) out.push(cell - 1);
  if (x < size - 1) out.push(cell + 1);
  if (y > 0) out.push(cell - size);
  if (y < size - 1) out.push(cell + size);
  return out;
};

/** Cells reachable from any seed through cells the predicate accepts. */
function reachFrom(seeds: number[], passable: (cell: number) => boolean, size: number): Uint8Array {
  const seen = new Uint8Array(size * size);
  const stack: number[] = [];
  for (const seed of seeds) {
    if (!passable(seed) || seen[seed] === 1) continue;
    seen[seed] = 1;
    stack.push(seed);
  }
  while (stack.length > 0) {
    const cell = required(stack.pop(), 'flood-fill cell');
    for (const next of neighboursOf(cell, size)) {
      if (seen[next] === 1 || !passable(next)) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }
  return seen;
}

/** The cell between the eyes, the same seed `pruneIslands` uses to find the person. */
export function faceSeed(size: number): number {
  return Math.round(size * 0.52) * size + Math.round(size / 2);
}

const countWhere = (length: number, hit: (index: number) => boolean): number => {
  let total = 0;
  for (let index = 0; index < length; index += 1) if (hit(index)) total += 1;
  return total;
};

/**
 * Who the subject is, before any setting is judged.
 *
 * The person is the confident-subject cells joined to the face, found through the *loosest*
 * possible mask so that the answer does not depend on the setting being scored. Everything else
 * that the model called subject — the bystander, the reflection — is deliberately not the person,
 * which is the whole point of the exercise.
 */
function regionsOf(subject: SubjectMask, box: CropBox, size: number): Regions {
  const loosest = maskFromModel(subject, box, { size, threshold: CONFIDENT_BACKGROUND });
  const joined = reachFrom([faceSeed(size)], (cell) => loosest[cell] === 0, size);
  const sure = maskFromModel(subject, box, { size, threshold: CONFIDENT_SUBJECT });
  const person = new Uint8Array(size * size);
  for (let cell = 0; cell < person.length; cell += 1) {
    person[cell] = sure[cell] === 0 && joined[cell] === 1 ? 1 : 0;
  }
  const empty = maskFromModel(subject, box, { size, threshold: CONFIDENT_BACKGROUND });
  return {
    person,
    personCount: countWhere(person.length, (cell) => person[cell] === 1),
    empty,
    emptyCount: countWhere(empty.length, (cell) => empty[cell] === 1),
  };
}

/**
 * Background that cannot reach the frame border.
 *
 * The structural prior the whole thing turns on. In the band between the two confident levels no
 * label can exist — that is what ambiguous means — so the score has to appeal to something other
 * than the matte, and "people are not perforated" is available for the price of one flood fill.
 */
export function enclosedHoles(mask: Uint8Array, size: number): number {
  const border: number[] = [];
  for (let step = 0; step < size; step += 1) {
    border.push(step, (size - 1) * size + step, step * size, step * size + size - 1);
  }
  const outside = reachFrom(border, (cell) => mask[cell] === 1, size);
  return countWhere(mask.length, (cell) => mask[cell] === 1 && outside[cell] !== 1);
}

/** The face survived if the seed and its four neighbours are all still subject. */
function faceSurvives(mask: Uint8Array, size: number): boolean {
  const seed = faceSeed(size);
  if (mask[seed] !== 0) return false;
  return neighboursOf(seed, size).every((cell) => mask[cell] === 0);
}

function metricsOf(mask: Uint8Array, regions: Regions, size: number): CutOutMetrics {
  const { person, personCount, empty, emptyCount } = regions;
  const dropped = countWhere(mask.length, (c) => person[c] === 1 && mask[c] === 1);
  const kept = countWhere(mask.length, (c) => empty[c] === 1 && mask[c] === 0);
  const sizes = componentSizesOf(mask, size);
  return {
    main: sizes[0] ?? 0,
    pieces: sizes.length,
    holes: enclosedHoles(mask, size),
    bite: personCount === 0 ? 0 : dropped / personCount,
    leak: emptyCount === 0 ? 0 : kept / emptyCount,
    faceIntact: faceSurvives(mask, size),
  };
}

const refusalFor = (metrics: CutOutMetrics): 'face' | 'holes' | null => {
  if (!metrics.faceIntact) return 'face';
  if (metrics.holes > HOLE_TOLERANCE) return 'holes';
  return null;
};

/** Every setting in the swept grid, measured. Ordering is threshold-major, which the plateau needs. */
export function scoreSettings(subject: SubjectMask, box: CropBox, size: number): Candidate[] {
  const regions = regionsOf(subject, box, size);
  const out: Candidate[] = [];
  for (const threshold of SWEPT_THRESHOLDS) {
    const base = maskFromModel(subject, box, { size, threshold });
    for (const island of CUT_OUT_STEPS.minIsland) {
      for (const edge of CUT_OUT_STEPS.edge) {
        const tuning = {
          removeBackground: true,
          threshold,
          minIsland: island.value,
          edge: edge.value,
        };
        const metrics = metricsOf(tunedMask(base, size, tuning), regions, size);
        out.push({ tuning, ...metrics, refused: refusalFor(metrics) });
      }
    }
  }
  return out;
}

/**
 * How much of the crop's alpha is in neither confident band — how far the matte can be trusted.
 *
 * `box` comes from a real face locator (`locateFace.ts`'s eye-distance arithmetic) or the skin
 * estimate (`faceBox`), and neither rounds — every other reader of a `CropBox` in this module
 * goes through `maskFromModel`, which rounds each pixel it samples. This one indexed `box.x`/
 * `box.y` directly and threw "Missing matte alpha" on any fractional crop, which a real BlazeFace
 * box always is. Rounding here matches `maskFromModel`'s treatment of the same box.
 */
export function ambiguityOf(subject: SubjectMask, box: CropBox): number {
  let middle = 0;
  let total = 0;
  const left = Math.round(box.x);
  const top = Math.round(box.y);
  const right = Math.min(subject.width, left + Math.round(box.size));
  const bottom = Math.min(subject.height, top + Math.round(box.size));
  for (let y = Math.max(0, top); y < bottom; y += 1) {
    for (let x = Math.max(0, left); x < right; x += 1) {
      const alpha = required(subject.alpha[y * subject.width + x], 'matte alpha');
      total += 1;
      if (alpha > CONFIDENT_BACKGROUND && alpha < CONFIDENT_SUBJECT) middle += 1;
    }
  }
  return total === 0 ? 0 : middle / total;
}

const sameShape = (one: Candidate, other: Candidate): boolean =>
  one.tuning.minIsland === other.tuning.minIsland && one.tuning.edge === other.tuning.edge;

/**
 * Priority order, never a weighted sum.
 *
 * A sum lets a large gain on a cheap axis pay for a catastrophe on an expensive one — two hundred
 * cells of leak are an untidy edge, two hundred cells of bite are a missing forearm, and no set of
 * weights makes that trade honestly. So: anything refused is out, and the rest are ranked by the
 * damage that the question was asked about.
 *
 * THE LAST KEY IS NOT A FORMALITY. With only bite and leak, a clean photograph leaves every
 * setting tied at zero and the winner is then whichever one the generating loops happened to emit
 * first — which is `Trim`, so the chooser quietly shaved a cell off everybody and the probe
 * reported it as an improvement over the default. Bite is measured on *confident* subject, and a
 * soft edge is by definition not confident, so nothing in the first two keys defends it. Ties go
 * to the setting the product already ships: a default moves only when it is measurably better.
 */
const distanceFromDefault = (one: Candidate): number =>
  Math.abs(one.tuning.edge - DEFAULT_TUNING.edge) +
  (one.tuning.minIsland === DEFAULT_TUNING.minIsland ? 0 : 1) +
  Math.abs(one.tuning.threshold - DEFAULT_TUNING.threshold) / 1000;

const better = (one: Candidate, other: Candidate): number => {
  if (one.bite !== other.bite) return one.bite - other.bite;
  if (one.leak !== other.leak) return one.leak - other.leak;
  return distanceFromDefault(one) - distanceFromDefault(other);
};

/**
 * The centre of the widest run of thresholds that all behave like the leader.
 *
 * "Behave like" is deliberately loose — within a quarter of a percent of the leader's bite — because
 * the point is to find where the answer stops depending on the exact number. Candidates arrive
 * threshold-major, so a run of acceptable ones at the same island/edge setting is contiguous here.
 *
 * Exported for its own test. Bite rises with threshold on every matte tried, which makes the
 * acceptable set a prefix and the restart below unreachable from a real sweep — so the only way to
 * show that a gap is handled is to hand it one.
 */
export function plateauOf(candidates: Candidate[], leader: Candidate): Candidate {
  const line = candidates.filter(
    (one) => one.refused === null && sameShape(one, leader) && one.bite <= leader.bite + 0.0025,
  );
  let best: Candidate[] = [];
  let run: Candidate[] = [];
  for (const one of line) {
    const previous = run.at(-1);
    run = previous === undefined || isNextThreshold(previous, one) ? [...run, one] : [one];
    if (run.length > best.length) best = run;
  }
  return required(best[Math.floor((best.length - 1) / 2)], 'plateau centre');
}

const isNextThreshold = (previous: Candidate, one: Candidate): boolean =>
  SWEPT_THRESHOLDS.indexOf(one.tuning.threshold) ===
  SWEPT_THRESHOLDS.indexOf(previous.tuning.threshold) + 1;

/** The swept threshold put back on the scale the participant is offered. */
function snapThreshold(threshold: number): number {
  const values: number[] = CUT_OUT_STEPS.threshold.map((step) => step.value);
  return values.reduce(
    (best, value) => (Math.abs(value - threshold) < Math.abs(best - threshold) ? value : best),
    required(values[0], 'a threshold step'),
  );
}

/**
 * A tuning to open the controls on — an initial value, never an override.
 *
 * ADR-077 is the answer when every setting is refused: a photograph where the matte cannot keep a
 * face intact or cannot stop perforating a torso is one where the honest move is to stop cutting
 * and show the photograph. That is a hatch the product already has, and reaching for it is a
 * better failure than shipping the least-bad mutilation.
 */
export function chooseTuning(subject: SubjectMask, box: CropBox, size: number): TuningChoice {
  const candidates = scoreSettings(subject, box, size);
  const ambiguity = ambiguityOf(subject, box);
  const surviving = candidates.filter((one) => one.refused === null).sort(better);
  const leader = surviving[0];
  if (leader === undefined) {
    return {
      tuning: { ...DEFAULT_TUNING, removeBackground: false },
      why: 'every setting lost the face or perforated the subject; keeping the photograph whole',
      ambiguity,
      candidates,
    };
  }
  const chosen = plateauOf(candidates, leader);
  return {
    tuning: { ...chosen.tuning, threshold: snapThreshold(chosen.tuning.threshold) },
    why: `bite ${(100 * chosen.bite).toFixed(1)}%, leak ${(100 * chosen.leak).toFixed(1)}%, ${chosen.holes} holes`,
    ambiguity,
    candidates,
  };
}
