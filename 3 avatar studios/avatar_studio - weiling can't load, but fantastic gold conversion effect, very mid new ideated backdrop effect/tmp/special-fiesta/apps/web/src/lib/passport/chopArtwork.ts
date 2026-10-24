import { positiveModulo } from './chopRandom.js';

/** The most of an outline a stamp may miss and still read as one shape. */
export const MAX_GAP_SHARE = 0.25;

/**
 * ADR-242 — what a die hands to the renderer.
 *
 * A die does not return markup and does not know anything about SVG filters. It returns these few
 * primitives, and `PassportChop` draws them: roughened, starved, pressed unevenly, ghosted and
 * turned, exactly as it does for every other die. That is what keeps the wear in one place instead
 * of nine, and what lets a new design be added by describing a shape rather than by touching the
 * component.
 */

/** A stretch of a frame's outline missing, where the ink did not reach. */
export interface Dash {
  readonly on: number;
  readonly off: number;
  readonly offset: number;
}

/**
 * The dash pattern for a frame that missed one edge, given the share of the outline that is
 * missing. A die whose ring is already broken by design — corner brackets, a solid slab — has no
 * closed outline to gap, so it hands back no frame at all rather than a frame of nothing.
 */
export function gapDash(perimeter: number, share: number, start: number): Dash {
  const missing = perimeter * Math.min(share, MAX_GAP_SHARE);
  return {
    on: perimeter - missing,
    off: missing,
    // A dash of `on` then `off` begins `offset` short of the path's first point.
    offset: positiveModulo(perimeter - missing - start * perimeter, perimeter),
  };
}

export interface ArtworkPath {
  readonly d: string;
  /** 0 means the shape is filled and has no outline of its own. */
  readonly width: number;
  readonly fill: 'ink' | 'none';
  /** Which colour an outline takes: the stamp's ink, or the pen someone finished it in. */
  readonly stroke: 'ink' | 'pen' | 'none';
  readonly dash?: Dash;
}

/** The outer outline of a die. Its length is what a gap is measured against. */
export interface ChopFrame extends ArtworkPath {
  readonly perimeter: number;
}

/**
 * One line of type. `y` and `rotate` hold one entry per character, which is how a stamp lands
 * some letters a little high and a little turned; a flat line simply repeats one number.
 */
export interface ArtworkLettering {
  readonly content: string;
  readonly x: number;
  readonly y: readonly number[];
  readonly size: number;
  readonly weight: number;
  /** The advance the line is stretched to: the width of the die, not of the letters. */
  readonly length: number;
  readonly rotate: readonly number[];
}

/** Type that runs along a curve, the way the rim of a round stamp carries its country's name. */
export interface ArtworkArc {
  readonly content: string;
  readonly path: string;
  readonly size: number;
  readonly weight: number;
}

export interface DieArtwork {
  /**
   * The outer outline, gapped when the impression missed an edge. Null for a die that has no
   * closed ring, and then no gap is possible.
   */
  readonly frame: ChopFrame | null;
  /** Solid ink, with the `knocked` lines punched out of it so the paper shows through. */
  readonly panels: readonly ArtworkPath[];
  readonly paths: readonly ArtworkPath[];
  readonly lettering: readonly ArtworkLettering[];
  readonly knocked: readonly ArtworkLettering[];
  readonly arcs: readonly ArtworkArc[];
}
