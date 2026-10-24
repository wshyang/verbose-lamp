import type { ArtworkPath, ChopFrame, DieArtwork } from './chopArtwork.js';
import {
  arcPath,
  blobPath,
  bracketPath,
  circlePath,
  circlePerimeter,
  ellipsePath,
  ellipsePerimeter,
  polygonPath,
  polygonPerimeter,
  rectPerimeter,
  roundedRectPath,
  rulePath,
  scrawlPath,
  starRingPath,
  ticksPath,
  wavyPath,
} from './chopGeo.js';
import { between, pick, type Random } from './chopRandom.js';
import { arcOf, heroOf, lineOf } from './chopType.js';

/**
 * ADR-242 — the dies. Nine of them, the way a passport page fills up with nine different offices.
 *
 * A real chop is not a design system: the office that stamps you draws whatever die its counter
 * holds, so the shapes, the inks and the small print differ from one country to the next, and so
 * does how carefully it was struck. That is what this catalogue is for. Each entry owns its
 * geometry, its inks and the ranges its own wear is drawn from. `ica-band` is the die ADR-241
 * shipped, drawn here from the same numbers: the double frame, the word across the middle, the
 * same ranges of tilt and wear, plus the band of small print a real die carries.
 *
 * A die is a pure drawing function of the stream it is handed. It gets the word, the station's
 * name and a serial, and it returns the primitives in `chopArtwork.ts` — never markup, never a
 * filter, never a colour it was not given.
 *
 * Two things every die below holds to, because `chopDies.test.ts` holds them: nothing is drawn
 * outside the cell, and nothing is set smaller than a phone can read at 120 px. That second rule
 * is why the round dies carry their name along the rim in fifteen letters rather than twenty-two,
 * and why a canceller's date sits in a straight line instead of an arc.
 */

/** Everything a die may vary, and how far it may vary it. */
export interface DieRanges {
  readonly rotation: readonly [number, number];
  readonly skew: readonly [number, number];
  readonly scale: readonly [number, number];
  readonly dx: readonly [number, number];
  readonly dy: readonly [number, number];
  readonly inkOpacity: readonly [number, number];
  readonly edgeFrequency: readonly [number, number];
  readonly edgeScale: readonly [number, number];
  readonly starveFrequency: readonly [number, number];
  readonly starveThreshold: readonly [number, number];
  readonly pressureFloor: readonly [number, number];
  /** How often the impression was struck twice. */
  readonly ghostChance: number;
  /** How often the outer ring missed an edge. Zero for a die with no closed ring. */
  readonly gapChance: number;
}

export interface DieContext {
  readonly random: Random;
  readonly word: string;
  /** The station's name, fitted to a straight line. */
  readonly name: string;
  /** The same name, cut shorter for the rim of a round die. */
  readonly nameOnArc: string;
  readonly serial: string;
}

export interface ChopDie {
  readonly id: ChopDieId;
  /** The name the design sheet calls it by. Never shown to a participant. */
  readonly label: string;
  /** The real die this one was drawn from, so a reader can check the reference. */
  readonly note: string;
  readonly inks: readonly string[];
  /** The inks a pen was picked up to finish the chop with, or null when nothing was. */
  readonly pen: readonly string[] | null;
  readonly ranges: DieRanges;
  readonly draw: (context: DieContext) => DieArtwork;
}

export type ChopDieId =
  | 'ica-band'
  | 'union-circle'
  | 'thick-frame'
  | 'crown-oval'
  | 'postmark'
  | 'hex-customs'
  | 'oct-vignette'
  | 'slab-knockout'
  | 'brackets-pen';

/** The wear an office that has stamped ten thousand people shows. */
const BASE_RANGES: DieRanges = {
  rotation: [-11, 11],
  skew: [-2.5, 2.5],
  scale: [0.95, 1.04],
  dx: [-8, 8],
  dy: [-5, 5],
  inkOpacity: [0.9, 0.98],
  edgeFrequency: [0.12, 0.2],
  edgeScale: [2, 3.2],
  starveFrequency: [0.035, 0.07],
  starveThreshold: [0.2, 0.28],
  pressureFloor: [0.6, 0.85],
  ghostChance: 0.4,
  gapChance: 0.6,
};

function stroked(d: string, width: number, stroke: 'ink' | 'pen' = 'ink'): ArtworkPath {
  return { d, width, fill: 'none', stroke };
}

function filled(d: string): ArtworkPath {
  return { d, width: 0, fill: 'ink', stroke: 'none' };
}

function framed(d: string, width: number, perimeter: number): ChopFrame {
  return { d, width, fill: 'none', stroke: 'ink', perimeter };
}

function artwork(partial: Partial<DieArtwork>): DieArtwork {
  return { frame: null, panels: [], paths: [], lettering: [], knocked: [], arcs: [], ...partial };
}

const round2 = (value: number): string => (Math.round(value * 100) / 100).toString();

/** A crown small enough to survive at 120 px: a band, three points, three pearls. */
function crownPath(centreY: number, halfWidth: number): string {
  const top = round2(centreY - halfWidth * 0.75);
  const mid = round2(centreY - halfWidth * 0.38);
  const high = round2(centreY - halfWidth * 0.91);
  const side = round2(-halfWidth);
  const half = round2(halfWidth / 2);
  const bottom = round2(centreY);
  return (
    `M ${side} ${bottom} L ${side} ${top} L ${round2(-halfWidth / 2)} ${mid} L 0 ${high} ` +
    `L ${half} ${mid} L ${round2(halfWidth)} ${top} L ${round2(halfWidth)} ${bottom} Z`
  );
}

/**
 * The die ADR-241 shipped: the word inside a double frame, with the office's name in a band above
 * it and a serial below. Modelled on the wide rectangle the Singapore and Malaysian immigration
 * counters use, whose corners are rounded and whose small print carries the date.
 */
function drawIcaBand(context: DieContext): DieArtwork {
  const { random, word, name, serial } = context;
  const width = 176;
  const height = 92;
  return artwork({
    frame: framed(
      roundedRectPath({ width, height, corner: 12 }),
      5.6,
      rectPerimeter({ width, height, corner: 12 }),
    ),
    paths: [
      stroked(roundedRectPath({ width: width - 16, height: height - 16, corner: 7 }), 1.5),
      stroked(rulePath(-72, 72, -14), 1.6),
      stroked(rulePath(-72, 72, -10.5), 1.6),
    ],
    lettering: [
      lineOf(random, { content: name, centre: 0, y: -22, size: 12, length: 132 }),
      heroOf(random, {
        content: word,
        centre: 0,
        y: 20,
        size: between(random, 25, 28),
        length: 140,
      }),
      lineOf(random, { content: `NO ${serial}`, centre: 0, y: 33, size: 8.5, length: 44, wobble: 0.3 }),
    ],
  });
}

/**
 * The round die of a Schengen border: two rings, the twelve stars between them, the office along
 * the rim, and the word across the middle between two rules. Blue, because union blue.
 */
function drawUnionCircle(context: DieContext): DieArtwork {
  const { random, word, nameOnArc, serial } = context;
  const ring = 55;
  return artwork({
    frame: framed(circlePath(ring), 5, circlePerimeter(ring)),
    paths: [
      stroked(circlePath(ring - 7.5), 1.7),
      filled(starRingPath({ count: 12, radius: 51, size: 3.4 })),
      stroked(rulePath(-36, 36, -14), 1.6),
      stroked(rulePath(-36, 36, 12), 1.6),
    ],
    lettering: [
      heroOf(random, { content: word, centre: 0, y: 3, size: 17, length: 70 }),
      lineOf(random, { content: `NO ${serial}`, centre: 0, y: 28, size: 8.5, length: 34, wobble: 0.3 }),
    ],
    arcs: [arcOf({ content: nameOnArc, path: arcPath({ radius: 37, from: -150, to: -30 }), size: 11 })],
  });
}

/**
 * A frame so thick the ink has been wiped off the edges of the letters: the landing permits some
 * north-east Asian counters print, where the border of the die is the heaviest thing on the page.
 * The name is knocked out of a solid bar rather than printed onto the paper.
 */
function drawThickFrame(context: DieContext): DieArtwork {
  const { random, word, name, serial } = context;
  const width = 150;
  const height = 100;
  return artwork({
    frame: framed(
      roundedRectPath({ width, height, corner: 6 }),
      9,
      rectPerimeter({ width, height, corner: 6 }),
    ),
    paths: [stroked(roundedRectPath({ width: width - 22, height: height - 20, corner: 3 }), 2)],
    panels: [filled(roundedRectPath({ width: width - 22, height: 18, corner: 2, cy: -28 }))],
    knocked: [lineOf(random, { content: name, centre: 0, y: -24, size: 11, weight: 800, length: 112 })],
    lettering: [
      heroOf(random, { content: word, centre: 0, y: 14, size: between(random, 20, 24), length: 116 }),
      lineOf(random, { content: `NO ${serial}`, centre: 0, y: 33, size: 8.5, length: 40, wobble: 0.3 }),
    ],
  });
}

/**
 * The oval of a Commonwealth border office: rings, a crown under the office's name along the
 * upper rim, the word across the middle and a rule beneath it for the date to be entered.
 * Struck in near-black blue, which is the ink these counters keep.
 */
function drawCrownOval(context: DieContext): DieArtwork {
  const { random, word, nameOnArc, serial } = context;
  return artwork({
    frame: framed(ellipsePath({ radiusX: 66, radiusY: 47 }), 4.5, ellipsePerimeter(66, 47)),
    paths: [
      stroked(ellipsePath({ radiusX: 58.5, radiusY: 39.5 }), 1.5),
      filled(crownPath(-20, 12)),
      stroked(rulePath(-26, 26, 22), 1.6),
    ],
    lettering: [
      heroOf(random, { content: word, centre: 0, y: 9, size: 16, length: 66 }),
      lineOf(random, { content: `NO ${serial}`, centre: 0, y: 33, size: 8, length: 34, wobble: 0.3 }),
    ],
    arcs: [arcOf({ content: nameOnArc, path: arcPath({ radius: 33, from: -152, to: -28 }), size: 10.5 })],
  });
}

/**
 * A postal canceller, which is what a chop looked like before anyone designed one: a double ring
 * of date at the left and the kill lines running off to the right across the page. It lands on
 * purpose, and it reads crooked because the lines do.
 */
function drawPostmark(context: DieContext): DieArtwork {
  const { random, word, nameOnArc, serial } = context;
  const cx = -40;
  const ring = 40;
  const oval = (radius: number): string => ellipsePath({ radiusX: radius, radiusY: radius, cx, cy: 0 });
  const waves = [0, 1, 2].map((index) =>
    stroked(wavyPath({ fromX: 4, toX: 94, y: -17 + index * 17, amplitude: 3.4, waves: 5 }), 2),
  );
  return artwork({
    frame: framed(oval(ring), 4.4, circlePerimeter(ring)),
    paths: [stroked(oval(ring - 7.5), 1.5), ...waves],
    lettering: [
      lineOf(random, { content: nameOnArc, centre: cx, y: -17, size: 9, length: 48, wobble: 0.3 }),
      heroOf(random, { content: word, centre: cx, y: 2, size: 13.5, length: 52 }),
      lineOf(random, { content: `NO ${serial}`, centre: cx, y: 20, size: 8, length: 30, wobble: 0.3 }),
    ],
  });
}

/**
 * A hexagon, because shape carries meaning at some counters: Singapore's visit passes are cut so
 * that the number of sides tells you how long you may stay. Same die, same word, six sides and a
 * hatch across the top and bottom. Struck by whoever was next in the queue.
 */
function drawHexCustoms(context: DieContext): DieArtwork {
  const { random, word, nameOnArc, serial } = context;
  return artwork({
    frame: framed(polygonPath({ radius: 58, sides: 6 }), 5.6, polygonPerimeter({ radius: 58, sides: 6 })),
    paths: [
      stroked(polygonPath({ radius: 49, sides: 6 }), 1.7),
      stroked(rulePath(-14, 14, -43), 1.5),
      stroked(rulePath(-14, 14, 43), 1.5),
    ],
    lettering: [
      lineOf(random, { content: nameOnArc, centre: 0, y: -33, size: 9.5, length: 54 }),
      heroOf(random, { content: word, centre: 0, y: 6, size: between(random, 19, 22), length: 86 }),
      lineOf(random, { content: `NO ${serial}`, centre: 0, y: 28, size: 8.5, length: 40, wobble: 0.3 }),
    ],
  });
}

/**
 * The octagon of a visa vignette: an engine-turned edge of forty-four ticks, small print above
 * and below the word, and violet ink that has stained the page. The ticks are what make it read
 * as an engraving rather than a rubber stamp.
 */
function drawOctVignette(context: DieContext): DieArtwork {
  const { random, word, nameOnArc, serial } = context;
  return artwork({
    frame: framed(
      polygonPath({ radius: 60, sides: 8, rotation: 22.5 }),
      5,
      polygonPerimeter({ radius: 60, sides: 8 }),
    ),
    paths: [
      stroked(polygonPath({ radius: 52, sides: 8, rotation: 22.5 }), 1.6),
      stroked(ticksPath({ count: 44, inner: 53.4, outer: 57.4, rotation: 22.5 }), 1.3),
    ],
    lettering: [
      lineOf(random, { content: nameOnArc, centre: 0, y: -20, size: 10, length: 68 }),
      heroOf(random, { content: word, centre: 0, y: 6, size: 17, length: 76 }),
      lineOf(random, { content: `NO ${serial}`, centre: 0, y: 30, size: 8.5, length: 44, wobble: 0.3 }),
    ],
  });
}

/**
 * Over-inked: the pad was saturated, the die came down hard, and the type is left as paper
 * showing through. The pools at the corners are what spat out at the edges of the slab.
 */
function drawSlabKnockout(context: DieContext): DieArtwork {
  const { random, word, name, serial } = context;
  return artwork({
    panels: [filled(roundedRectPath({ width: 172, height: 74, corner: 3 }))],
    paths: [
      filled(blobPath({ cx: 84, cy: 30, radius: 8, lobes: 3, lumpiness: 0.45 })),
      filled(blobPath({ cx: -86, cy: -30, radius: 6, lobes: 4, lumpiness: 0.5 })),
    ],
    knocked: [
      lineOf(random, { content: name, centre: 0, y: -25, size: 10.5, weight: 800, length: 132 }),
      heroOf(random, {
        content: word,
        centre: 0,
        y: 8,
        size: between(random, 25, 29),
        length: 150,
      }),
      lineOf(random, { content: `NO ${serial}`, centre: 0, y: 29, size: 8, weight: 700, length: 40 }),
    ],
  });
}

/**
 * The counter that has seen a thousand people this hour: four corner marks, the office, the word,
 * a printed line for the date — and the date then put in by hand, in somebody else's ballpoint.
 * The faintest impression on the page and the most tilted.
 */
function drawBracketsPen(context: DieContext): DieArtwork {
  const { random, word, nameOnArc } = context;
  return artwork({
    paths: [
      stroked(bracketPath({ width: 150, height: 84, arm: 20 }), 4),
      stroked(rulePath(-38, 38, 33), 1.2),
      stroked(scrawlPath({ x: -34, y: 29, width: 62, height: 8, loops: 2 }), 1.7, 'pen'),
    ],
    lettering: [
      lineOf(random, { content: nameOnArc, centre: 0, y: -24, size: 11, weight: 700, length: 116 }),
      heroOf(random, { content: word, centre: 0, y: 4, size: 26, length: 118 }),
    ],
  });
}

export const CHOP_DIES: readonly ChopDie[] = [
  {
    id: 'ica-band',
    label: 'Immigration band',
    note: 'The wide rounded rectangle of the Singapore and Malaysian counters: name in a band, serial below.',
    inks: ['#c4342b', '#b8323e'],
    pen: null,
    ranges: BASE_RANGES,
    draw: drawIcaBand,
  },
  {
    id: 'union-circle',
    label: 'Union circle',
    note: 'A Schengen round die: two rings, twelve stars between them, the office along the rim.',
    inks: ['#1f4fa3', '#2b5aa6'],
    pen: null,
    ranges: {
      ...BASE_RANGES,
      rotation: [-6, 6],
      scale: [0.96, 1.05],
      edgeScale: [1.2, 2],
      starveThreshold: [0.14, 0.2],
      ghostChance: 0.3,
      gapChance: 0.45,
    },
    draw: drawUnionCircle,
  },
  {
    id: 'thick-frame',
    label: 'Thick frame',
    note: 'A north-east Asian landing permit: the border heavier than the type, which is knocked out.',
    inks: ['#5a2d8c', '#4a2674'],
    pen: null,
    ranges: {
      ...BASE_RANGES,
      rotation: [-4, 4],
      scale: [0.98, 1.02],
      edgeScale: [1.4, 2.4],
      starveThreshold: [0.16, 0.24],
      ghostChance: 0.25,
      gapChance: 0.25,
    },
    draw: drawThickFrame,
  },
  {
    id: 'crown-oval',
    label: 'Crown oval',
    note: 'A Commonwealth border office: oval, crown, the office along the upper rim, a rule for the date.',
    inks: ['#23262c', '#2f3a44'],
    pen: null,
    ranges: {
      ...BASE_RANGES,
      rotation: [-8, 8],
      edgeScale: [1.4, 2.4],
      starveThreshold: [0.16, 0.22],
      ghostChance: 0.3,
      gapChance: 0.5,
    },
    draw: drawCrownOval,
  },
  {
    id: 'postmark',
    label: 'Canceller',
    note: 'A postal killing-out: a double ring of date at the left, wavy lines running off the page.',
    inks: ['#3a4b5c', '#46596b'],
    pen: null,
    ranges: {
      ...BASE_RANGES,
      rotation: [-5, 5],
      scale: [0.95, 1.05],
      edgeScale: [1.4, 2.4],
      starveFrequency: [0.05, 0.09],
      starveThreshold: [0.16, 0.24],
      ghostChance: 0.2,
      gapChance: 0.35,
    },
    draw: drawPostmark,
  },
  {
    id: 'hex-customs',
    label: 'Hexagon customs',
    note: 'Six sides because the shape is the visa: the visit passes that count days in corners.',
    inks: ['#0f6b5c', '#12776a'],
    pen: null,
    ranges: {
      ...BASE_RANGES,
      rotation: [-13, 13],
      scale: [0.94, 1.03],
      starveThreshold: [0.18, 0.26],
      ghostChance: 0.45,
      gapChance: 0.5,
    },
    draw: drawHexCustoms,
  },
  {
    id: 'oct-vignette',
    label: 'Vignette octagon',
    note: 'An engraved visa vignette: forty-four ticks round the edge, small print, violet ink.',
    inks: ['#7a2f4f', '#6b2a58'],
    pen: null,
    ranges: {
      ...BASE_RANGES,
      rotation: [-7, 7],
      scale: [0.97, 1.03],
      edgeScale: [1, 1.8],
      starveThreshold: [0.16, 0.22],
      gapChance: 0.4,
    },
    draw: drawOctVignette,
  },
  {
    id: 'slab-knockout',
    label: 'Over-inked slab',
    note: 'A saturated pad and a hard press: solid ink, the type left as bare paper.',
    inks: ['#c4342b', '#a8281f'],
    pen: null,
    ranges: {
      ...BASE_RANGES,
      rotation: [-9, 9],
      scale: [0.96, 1.02],
      inkOpacity: [0.94, 0.99],
      starveThreshold: [0.26, 0.36],
      ghostChance: 0.5,
      gapChance: 0,
    },
    draw: drawSlabKnockout,
  },
  {
    id: 'brackets-pen',
    label: 'Brackets, dated in pen',
    note: 'Four corner marks, a printed line, and somebody else’s ballpoint over the top of it.',
    inks: ['#20407a', '#2b4a7d'],
    pen: ['#1b1b1b', '#b3271f'],
    ranges: {
      ...BASE_RANGES,
      rotation: [-13, 13],
      scale: [0.92, 1.06],
      dx: [-10, 10],
      dy: [-6, 6],
      inkOpacity: [0.8, 0.94],
      edgeScale: [1.6, 2.6],
      starveThreshold: [0.24, 0.34],
      pressureFloor: [0.5, 0.75],
      ghostChance: 0.12,
      gapChance: 0,
    },
    draw: drawBracketsPen,
  },
];

export const CHOP_DIE_IDS: readonly ChopDieId[] = CHOP_DIES.map((die) => die.id);

export function dieById(id: ChopDieId): ChopDie {
  const die = CHOP_DIES.find((candidate) => candidate.id === id);
  if (die !== undefined) return die;
  throw new Error(`no chop die is registered under "${id}"`);
}

/** The ink of the impression, and of the pen that finished it. A die without a pen uses its ink. */
export function drawInks(random: Random, die: ChopDie): { ink: string; pen: string } {
  const ink = pick(random, die.inks);
  return { ink, pen: die.pen === null ? ink : pick(random, die.pen) };
}
