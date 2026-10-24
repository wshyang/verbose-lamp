import type { ChopFrame, DieArtwork } from './chopArtwork.js';
import { gapDash } from './chopArtwork.js';
import { dieById, drawInks, type ChopDieId, type DieContext, type DieRanges } from './chopDies.js';
import { between, chance, seededRandom, serialNumber, turbulenceSeed, type Random } from './chopRandom.js';
import { fitArcLabel, fitLabel } from './chopType.js';

/**
 * ADR-241 / ADR-242 — an impression, from a seed and a die.
 *
 * `buildChop` is a pure function of its two inputs. It reads no clock and no `Math.random`, so one
 * seed on one die draws one mark every time, which is all a device has to remember (ADR-240).
 *
 * The order of the draws below is the recipe. Wear is drawn first, in the same order for every
 * die, so the parts of an impression a participant compares between stations — the tilt, the dry
 * patches, the pressure — come out of the same stretch of the sequence. The die then draws its own
 * geometry and its own small print from wherever the stream has got to. Changing a range, adding a
 * draw or reordering these lines redraws every chop already stamped, so each such change needs an
 * ADR of its own.
 */

/** The one word a chop says. Every die carries it, and it is the mark's accessible name. */
export const CHOP_WORD = 'Completed';

export interface Placement {
  /** Degrees. The whole impression turns about the centre of the cell. */
  rotation: number;
  /** Degrees of horizontal skew: the stamp was not held level. */
  skew: number;
  scale: number;
  /** View-box units from the centre of the cell it was stamped into. */
  dx: number;
  dy: number;
}

export interface ChopSpec {
  seed: number;
  /** Which office struck this impression. The die belongs to the station (ADR-242). */
  die: ChopDieId;
  /** The die's own name, for the design sheet. The app never shows it. */
  dieLabel: string;
  ink: string;
  /** The colour of anything finished by hand after the stamp went down. */
  penInk: string;
  inkOpacity: number;
  placement: Placement;
  /** Roughens the outline: the edge of a rubber stamp is never quite straight. */
  edge: { frequency: number; scale: number; seed: number };
  /** Lets the ink fall short in patches, where the pad was dry or the pressure gave out. */
  starve: { frequency: number; threshold: number; seed: number };
  /** Runs from full ink at one side to `floor` at the other. */
  pressure: { x1: number; y1: number; x2: number; y2: number; floor: number };
  /** A second, fainter strike a little off the first. */
  ghost: { dx: number; dy: number; opacity: number } | null;
  /** What the die drew, with the gap in its outer ring already cut into it. */
  artwork: DieArtwork;
}

function drawPlacement(random: Random, ranges: DieRanges): Placement {
  return {
    rotation: between(random, ranges.rotation[0], ranges.rotation[1]),
    skew: between(random, ranges.skew[0], ranges.skew[1]),
    scale: between(random, ranges.scale[0], ranges.scale[1]),
    dx: between(random, ranges.dx[0], ranges.dx[1]),
    dy: between(random, ranges.dy[0], ranges.dy[1]),
  };
}

function drawEdge(random: Random, ranges: DieRanges): ChopSpec['edge'] {
  return {
    frequency: between(random, ranges.edgeFrequency[0], ranges.edgeFrequency[1]),
    scale: between(random, ranges.edgeScale[0], ranges.edgeScale[1]),
    seed: turbulenceSeed(random),
  };
}

function drawStarve(random: Random, ranges: DieRanges): ChopSpec['starve'] {
  return {
    frequency: between(random, ranges.starveFrequency[0], ranges.starveFrequency[1]),
    threshold: between(random, ranges.starveThreshold[0], ranges.starveThreshold[1]),
    seed: turbulenceSeed(random),
  };
}

function drawPressure(random: Random, ranges: DieRanges): ChopSpec['pressure'] {
  const angle = between(random, 0, 2 * Math.PI);
  const reach = 110;
  return {
    x1: -reach * Math.cos(angle),
    y1: -reach * Math.sin(angle),
    x2: reach * Math.cos(angle),
    y2: reach * Math.sin(angle),
    floor: between(random, ranges.pressureFloor[0], ranges.pressureFloor[1]),
  };
}

function drawGhost(random: Random, ranges: DieRanges): ChopSpec['ghost'] {
  const strike = {
    dx: between(random, -3, 3),
    dy: between(random, -2.5, 2.5),
    opacity: between(random, 0.12, 0.22),
  };
  return chance(random, ranges.ghostChance) ? strike : null;
}

/** One stretch of the outer ring that did not take. Nothing to gap on an open frame. */
function drawGap(random: Random, ranges: DieRanges, frame: ChopFrame | null): ChopFrame | null {
  const took = chance(random, ranges.gapChance);
  const share = between(random, 0.05, 0.11);
  const start = random();
  if (!took || frame === null) return frame;
  return { ...frame, dash: gapDash(frame.perimeter, share, start) };
}

/** The impression one seed makes on one die. The same two inputs always return the same spec. */
export function buildChop(seed: number, dieId: ChopDieId, stationName: string): ChopSpec {
  const die = dieById(dieId);
  const random = seededRandom(seed);
  const { ink, pen } = drawInks(random, die);
  const ranges = die.ranges;
  const inkOpacity = between(random, ranges.inkOpacity[0], ranges.inkOpacity[1]);
  const placement = drawPlacement(random, ranges);
  const edge = drawEdge(random, ranges);
  const starve = drawStarve(random, ranges);
  const pressure = drawPressure(random, ranges);
  const ghost = drawGhost(random, ranges);
  const context: DieContext = {
    random,
    word: CHOP_WORD,
    name: fitLabel(stationName),
    nameOnArc: fitArcLabel(stationName),
    serial: serialNumber(random, 4),
  };
  const drawn = die.draw(context);
  return {
    seed: seed >>> 0,
    die: die.id,
    dieLabel: die.label,
    ink,
    penInk: pen,
    inkOpacity,
    placement,
    edge,
    starve,
    pressure,
    ghost,
    artwork: { ...drawn, frame: drawGap(random, ranges, drawn.frame) },
  };
}
