import type { SequenceChapter } from '../model/types';

/**
 * The title sequence's timing grammar, lifted out of the renderer
 * (ADDENDUM-022 §0.7). Pure: no `three`, no DOM, no clock. Every value the
 * animation used to compute inline is computed here instead, so the R3F port and
 * the imperative renderer cannot drift apart, and the choreography is testable
 * without a GPU.
 */

export interface CardPhase {
  /** Golden frame trim-path draw-on, 0..1. */
  drawProgress: number;
  /** Typography reveal, 0..1. */
  textProgress: number;
  /** Theatrical gate parting as the camera flies through, 0..1. */
  partOpen: number;
  /** Master fade, 0..1. */
  opacity: number;
}

export interface CardPhaseInput {
  /** Chapter-local normalised time: 0 at `startTime`, 1 at `endTime`. */
  localT: number;
  isFinale: boolean;
}

export interface CinemaCameraInput {
  chapters: readonly SequenceChapter[];
  activeIdx: number;
  /** Clamped 0..1 progress through the active chapter. */
  chapterLocal: number;
  /** Aspect-driven pull-back (see `resolveViewportFit`). */
  pullback: number;
}

export interface GreenLight {
  intensity: number;
  /** World Z the green light sits at. */
  z: number;
}

export interface SearchlightSway {
  left: number;
  right: number;
}

export type Vec3 = readonly [number, number, number];

export interface LightRig {
  key: Vec3;
  rim: Vec3;
  cool: Vec3;
}

export interface RigAnchors {
  backdropZ: number;
  lightZ: number;
}

/** Identical to `THREE.MathUtils.smoothstep`, reimplemented so nothing imports `three`. */
export function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Cards outside this local-time window are fully invisible. */
export const CARD_WINDOW = { before: -0.18, after: 1.18 } as const;

/** Nitrate filter strength when the user forces the 1920s look. */
export const FORCED_NITRATE = 0.92;
/** The opening silver-nitrate bloom is scaled down to this fraction of full strength. */
export const OPENING_NITRATE_SCALE = 0.82;

/** Index of the chapter containing `t`; `t` past the end stays on the finale. */
export function activeChapterIndex(t: number, chapters: readonly SequenceChapter[]): number {
  for (let i = 0; i < chapters.length; i += 1) {
    if (t >= chapters[i].startTime && t < chapters[i].endTime) return i;
  }
  return chapters.length - 1;
}

const INVISIBLE_CARD: CardPhase = { drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0 };

/** Draw-on, text wipe, gate parting and fade for one card. */
export function cardPhase({ localT, isFinale }: CardPhaseInput): CardPhase {
  if (localT < CARD_WINDOW.before || localT > CARD_WINDOW.after) return INVISIBLE_CARD;
  const fadeIn = smoothstep(localT, -0.15, 0.04);
  const fadeOut = isFinale
    ? 1 - smoothstep(localT, 0.91, 0.995)
    : 1 - smoothstep(localT, 0.94, 1.08);
  return {
    drawProgress: smoothstep(localT, -0.04, 0.42),
    textProgress: smoothstep(localT, 0.14, 0.5),
    // The finale holds majestically instead of parting.
    partOpen: isFinale ? 0 : smoothstep(localT, 0.8, 1.03),
    opacity: fadeIn * fadeOut,
  };
}

/** Stately push-in during the hold, then the fly-through portal, then the finale drift. */
export function cinemaCameraZ({
  chapters,
  activeIdx,
  chapterLocal,
  pullback,
}: CinemaCameraInput): number {
  const chapter = chapters[activeIdx];
  if (activeIdx === chapters.length - 1) return finaleZ({ chapter, chapterLocal, pullback });
  return flightZ({ chapters, activeIdx, chapterLocal, pullback, chapter });
}

interface ChapterInput {
  chapter: SequenceChapter;
  chapterLocal: number;
  pullback: number;
}

function holdZ({ chapter, chapterLocal, pullback }: ChapterInput): number {
  const startDist = 12.2 + pullback;
  const endDist = 9.0 + pullback * 0.85;
  return lerp(chapter.zPosition + startDist, chapter.zPosition + endDist, chapterLocal / 0.78);
}

function flyZ(input: ChapterInput & { chapters: readonly SequenceChapter[]; activeIdx: number }): number {
  const { chapters, activeIdx, chapter, chapterLocal, pullback } = input;
  const flyFrac = (chapterLocal - 0.78) / 0.22;
  const easeFly = flyFrac * flyFrac * (3 - 2 * flyFrac);
  const nextIsFinale = activeIdx + 1 === chapters.length - 1;
  const nextStartDist = (nextIsFinale ? 15.2 : 12.2) + pullback;
  const endDist = 9.0 + pullback * 0.85;
  const nextZ = chapters[activeIdx + 1].zPosition + nextStartDist;
  return lerp(chapter.zPosition + endDist, nextZ, easeFly);
}

function flightZ(
  input: ChapterInput & { chapters: readonly SequenceChapter[]; activeIdx: number }
): number {
  return input.chapterLocal < 0.78 ? holdZ(input) : flyZ(input);
}

/** The finale frames the whole Chrysler crown and diamond wings, then drifts. */
function finaleZ({ chapter, chapterLocal, pullback }: ChapterInput): number {
  const heroStart = 15.2 + pullback;
  const heroHold = 12.4 + pullback;
  const easeHero = 1 - Math.pow(1 - Math.min(1, chapterLocal / 0.52), 2.5);
  const drift = chapterLocal * 0.75;
  return lerp(chapter.zPosition + heroStart, chapter.zPosition + heroHold, easeHero) - drift;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The distant emerald dock light: strong behind the GG gate in act I, and a
 * quieter bookend in the finale. Elsewhere it is dark.
 */
export function greenLight({ t, heroZ }: { t: number; heroZ: number }): GreenLight {
  const act1Green = 1 - smoothstep(t, 4.8, 7.6);
  const finaleBookend = smoothstep(t, 34.8, 37.6) * 0.65;
  return {
    intensity: Math.max(act1Green, finaleBookend),
    z: t > 30 ? heroZ - 7.5 : -7.5,
  };
}

/** Silver-nitrate strength during the opening (0.35 s → 2.55 s). */
export function openingNitrate(t: number): number {
  return 1 - smoothstep(t, 0.35, 2.55);
}

/** Volumetric premiere searchlight sway, in radians. */
export function searchlightSway(elapsed: number): SearchlightSway {
  return {
    left: -0.36 + Math.sin(elapsed * 0.38) * 0.14,
    right: 0.36 + Math.cos(elapsed * 0.33) * 0.14,
  };
}

/** The three-point rig orbits the focused card so the bevelled gold keeps gleaming. */
export function lightRig(elapsed: number, focusZ: number): LightRig {
  return {
    key: [Math.sin(elapsed * 0.75) * 5.5, 2.6 + Math.cos(elapsed * 0.5) * 1.4, focusZ + 3.2],
    rim: [Math.cos(elapsed * 0.62) * -6.0, -2.2 + Math.sin(elapsed * 0.55) * 1.5, focusZ + 1.5],
    cool: [0, 4.5, focusZ - 2.0],
  };
}

/** Where the backdrop and light rig ride, depending on camera mode. */
export function rigAnchors({
  cameraMode,
  cameraZ,
  chapterZ,
}: {
  cameraMode: 'cinema' | 'orbit';
  cameraZ: number;
  chapterZ: number;
}): RigAnchors {
  const isCinema = cameraMode === 'cinema';
  return {
    backdropZ: isCinema ? cameraZ - 12.0 : chapterZ - 3.5,
    lightZ: isCinema ? cameraZ - 6.5 : chapterZ + 3.5,
  };
}

/** The nitrate pass value for this frame: forced, or the opening bloom. */
export function nitrateLevel({ t, forced }: { t: number; forced: boolean }): number {
  return forced ? FORCED_NITRATE : openingNitrate(t) * OPENING_NITRATE_SCALE;
}
