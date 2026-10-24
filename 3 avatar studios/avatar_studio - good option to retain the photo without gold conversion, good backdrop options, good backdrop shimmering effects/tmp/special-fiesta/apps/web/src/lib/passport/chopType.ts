import type { ArtworkArc, ArtworkLettering } from './chopArtwork.js';
import { between, type Random } from './chopRandom.js';

/**
 * ADR-242 — setting the type a die carries.
 *
 * The word is live text on every die, so it is always the exact word and always legible, and the
 * station's name is real data from the day rather than something the artwork invented. Both come
 * through here, so a line is stretched to the die's own width and every letter gets its own
 * height and its own turn from the same stream the rest of the impression is drawn from.
 */

/** A station called `Sandcastle Relay_0fczx0` is a lot of letters for a 120 px mark. */
export const MAX_LABEL = 22;

/**
 * Along a rim there is less room than across a band, and letters splay as they go round it, so a
 * curved line gets a shorter one. A name that does not fit the arc is worse than a name cut short.
 */
export const MAX_ARC_LABEL = 15;

/** Small print along a rim is set light: the word is the thing a chop shouts. */
const ARC_WEIGHT = 700;

/** Uppercase, collapsed, and no longer than the die can carry: chops shout, and they are small. */
function shout(value: string, max: number): string {
  const label = value.trim().replace(/\s+/gu, ' ').toUpperCase();
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1).trimEnd()}…`;
}

export function fitLabel(value: string): string {
  return shout(value, MAX_LABEL);
}

/** The same name, cut for a curve. */
export function fitArcLabel(value: string): string {
  return shout(value, MAX_ARC_LABEL);
}

/** How wide a line of small caps runs: a rough estimate, used only where a die sets no width. */
export function estimateLength(content: string, size: number): number {
  return Math.round(content.length * size * 0.68);
}

export interface LineSpec {
  readonly content: string;
  /** Where the line is centred. The starting point is derived from it and from `length`. */
  readonly centre: number;
  readonly y: number;
  readonly size: number;
  readonly weight?: number;
  readonly length?: number;
  /** How far a letter's baseline may wander, and how far it may turn, in view-box units/degrees. */
  readonly wobble?: number;
  readonly spin?: number;
}

function lettersOf(random: Random, spec: { content: string; y: number; wobble: number; spin: number }) {
  const characters = Array.from(spec.content);
  return {
    y: characters.map(() => spec.y + between(random, -spec.wobble, spec.wobble)),
    rotate: characters.map(() => between(random, -spec.spin, spec.spin)),
  };
}

/** A printed line: the station's name, a serial, a date band. Quiet, but never dead flat. */
export function lineOf(random: Random, spec: LineSpec): ArtworkLettering {
  const length = spec.length ?? estimateLength(spec.content, spec.size);
  const letters = lettersOf(random, {
    content: spec.content,
    y: spec.y,
    wobble: spec.wobble ?? 0.45,
    spin: spec.spin ?? 1.1,
  });
  return {
    content: spec.content,
    x: spec.centre - length / 2,
    y: letters.y,
    size: spec.size,
    weight: spec.weight ?? 700,
    length,
    rotate: letters.rotate,
  };
}

/** The word itself. Larger, heavier, stretched across the die, and the most uneven thing on it. */
export function heroOf(random: Random, spec: LineSpec): ArtworkLettering {
  return lineOf(random, {
    wobble: 0.9,
    spin: 3.5,
    weight: 800,
    ...spec,
  });
}

/** Type on a curve. The path is the die's; centring the line on it is the renderer's job. */
export interface ArcLineSpec {
  readonly content: string;
  readonly path: string;
  readonly size: number;
}

export function arcOf(spec: ArcLineSpec): ArtworkArc {
  return { content: spec.content, path: spec.path, size: spec.size, weight: ARC_WEIGHT };
}
