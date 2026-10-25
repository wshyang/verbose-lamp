import type { SequenceChapter } from '../model/types';

/**
 * The premiere's timing, extracted from `GatsbySceneManager.animate()` (ADDENDUM-022
 * §6, step 0.7). Every function here is pure: seconds in, numbers out, no `three`
 * import — so the choreography can be snapshotted in node while the renderer keeps
 * its own copy of nothing. The manager calls these; it no longer owns the maths.
 */

/** Same curve as `THREE.MathUtils.smoothstep`, re-implemented so this file stays three-free. */
export function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
}

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Index of the chapter covering `t`; the last chapter owns every overshoot. */
export function activeChapterIndex(t: number, chapters: readonly SequenceChapter[]): number {
  for (let i = 0; i < chapters.length; i += 1) {
    if (t >= chapters[i].startTime && t < chapters[i].endTime) return i;
  }
  return chapters.length - 1;
}

export interface CardPhase {
  /** 0..1 golden frame trim-path draw. */
  drawProgress: number;
  /** 0..1 typography reveal. */
  textProgress: number;
  /** 0..1 theatrical gate parting as the camera flies through. */
  partOpen: number;
  /** 0..1 master fade. */
  opacity: number;
}

/** Fully hidden outside [-0.18, 1.18] of the card's own 0..1 life. */
export const CARD_PHASE_WINDOW = [-0.18, 1.18] as const;

function fadeIn(localT: number): number {
  return smoothstep(localT, -0.15, 0.04);
}

function fadeOut(localT: number, isFinale: boolean): number {
  // The finale holds to the last moment and bows out inside a single frame window;
  // every other card is already flying past the lens when it fades.
  return isFinale ? 1 - smoothstep(localT, 0.91, 0.995) : 1 - smoothstep(localT, 0.94, 1.08);
}

/**
 * One card's state at `localT` (0 = its first frame, 1 = its last). `isFinale`
 * suppresses the gate parting: the hero card holds majestically instead of opening.
 */
export function cardPhase(localT: number, isFinale: boolean): CardPhase {
  const [enter, exit] = CARD_PHASE_WINDOW;
  if (localT < enter || localT > exit) {
    return { drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0 };
  }
  return {
    drawProgress: smoothstep(localT, -0.04, 0.42),
    textProgress: smoothstep(localT, 0.14, 0.5),
    partOpen: isFinale ? 0 : smoothstep(localT, 0.8, 1.03),
    opacity: fadeIn(localT) * fadeOut(localT, isFinale),
  };
}

export interface CameraPathInput {
  chapters: readonly SequenceChapter[];
  activeIdx: number;
  /** Clamped position inside the active chapter, 0..1. */
  chapterLocal: number;
  /** Aspect-responsive pull-back, so narrow viewports never clip the wings. */
  pullback: number;
}

/** Hold (0..0.78) then fly through the portal (0.78..1) into the next chamber. */
const HOLD_END = 0.78;
const START_DISTANCE = 12.2;
const END_DISTANCE = 9.0;
const NEXT_FINALE_START_DISTANCE = 15.2;
/** The finale opens from further back so the whole Chrysler crown reads. */
const HERO_START_DISTANCE = 15.2;
const HERO_HOLD_DISTANCE = 12.4;
const HERO_EASE_END = 0.52;
const HERO_EASE_POWER = 2.5;
const HERO_DRIFT_PER_UNIT = 0.75;

function holdOrFly(input: CameraPathInput, chapter: SequenceChapter): number {
  const { chapters, activeIdx, chapterLocal, pullback } = input;
  const startDist = START_DISTANCE + pullback;
  const endDist = END_DISTANCE + pullback * 0.85;
  if (chapterLocal < HOLD_END) {
    return lerp(chapter.zPosition + startDist, chapter.zPosition + endDist, chapterLocal / HOLD_END);
  }
  const flyFraction = (chapterLocal - HOLD_END) / (1 - HOLD_END);
  const eased = smoothstep(flyFraction, 0, 1);
  const nextIsFinale = activeIdx + 1 === chapters.length - 1;
  const nextStart = (nextIsFinale ? NEXT_FINALE_START_DISTANCE : START_DISTANCE) + pullback;
  const nextZ = chapters[activeIdx + 1].zPosition + nextStart;
  return lerp(chapter.zPosition + endDist, nextZ, eased);
}

function finalePath(chapter: SequenceChapter, chapterLocal: number, pullback: number): number {
  const heroStart = HERO_START_DISTANCE + pullback;
  const heroHold = HERO_HOLD_DISTANCE + pullback;
  const eased = 1 - Math.pow(1 - Math.min(1, chapterLocal / HERO_EASE_END), HERO_EASE_POWER);
  return lerp(chapter.zPosition + heroStart, chapter.zPosition + heroHold, eased) - chapterLocal * HERO_DRIFT_PER_UNIT;
}

/** Camera Z for the cinema path. Orbit mode does not call this (it owns the camera). */
export function cinemaCameraZ(input: CameraPathInput): number {
  const chapter = input.chapters[input.activeIdx];
  const isFinale = input.activeIdx === input.chapters.length - 1;
  return isFinale ? finalePath(chapter, input.chapterLocal, input.pullback) : holdOrFly(input, chapter);
}

/** Seconds after which the green light follows the hero card instead of Act I's gate. */
const GREEN_LIGHT_HANDOVER = 30;
const GREEN_LIGHT_BEHIND_HERO = 7.5;
const ACT1_GREEN_START = 4.8;
const ACT1_GREEN_END = 7.6;
const FINALE_GREEN_START = 34.8;
const FINALE_GREEN_END = 37.6;
const FINALE_GREEN_LEVEL = 0.65;

export interface GreenLight {
  /** 0..1; the mesh hides itself below 0.01. */
  intensity: number;
  z: number;
}

/** Act I's dock beacon, then a quieter bookend behind the hero card. */
export function greenLight(t: number, chapters: readonly SequenceChapter[]): GreenLight {
  const act1 = 1 - smoothstep(t, ACT1_GREEN_START, ACT1_GREEN_END);
  const bookend = smoothstep(t, FINALE_GREEN_START, FINALE_GREEN_END) * FINALE_GREEN_LEVEL;
  return {
    intensity: Math.max(act1, bookend),
    z: t > GREEN_LIGHT_HANDOVER ? chapters[chapters.length - 1].zPosition - GREEN_LIGHT_BEHIND_HERO : -7.5,
  };
}

const NITRATE_END = 2.55;
const NITRATE_START = 0.35;
const OPENING_NITRATE_LEVEL = 0.82;
/** Forced 1920s projection: strong, but not a flat black-and-white print. */
export const FORCED_NITRATE = 0.92;

/** The opening's automatic silver-nitrate bloom, already scaled to its peak level. */
export function openingNitrate(t: number): number {
  return (1 - smoothstep(t, NITRATE_START, NITRATE_END)) * OPENING_NITRATE_LEVEL;
}

export interface SearchlightSway {
  left: number;
  right: number;
}

/** Counter-swaying premiere searchlights, in radians. */
export function searchlightSway(elapsed: number): SearchlightSway {
  return {
    left: -0.36 + Math.sin(elapsed * 0.38) * 0.14,
    right: 0.36 + Math.cos(elapsed * 0.33) * 0.14,
  };
}

export type Vec3 = readonly [number, number, number];

export interface LightRig {
  key: Vec3;
  rim: Vec3;
  cool: Vec3;
}

/** The three moving point lights, orbiting the card the camera is looking at. */
export function lightRig(elapsed: number, focusZ: number): LightRig {
  return {
    key: [Math.sin(elapsed * 0.75) * 5.5, 2.6 + Math.cos(elapsed * 0.5) * 1.4, focusZ + 3.2],
    rim: [Math.cos(elapsed * 0.62) * -6.0, -2.2 + Math.sin(elapsed * 0.55) * 1.5, focusZ + 1.5],
    cool: [0, 4.5, focusZ - 2.0],
  };
}

export interface RigAnchorInput {
  cameraMode: 'cinema' | 'orbit';
  cameraZ: number;
  chapterZ: number;
}

export interface RigAnchors {
  /** Where the recessed wallpaper wall and the searchlights sit. */
  backdropZ: number;
  /** The Z the lighting rig orbits around. */
  lightZ: number;
}

/** Architecture follows the camera in cinema mode and the card in orbit mode. */
export function rigAnchors({ cameraMode, cameraZ, chapterZ }: RigAnchorInput): RigAnchors {
  return cameraMode === 'cinema'
    ? { backdropZ: cameraZ - 12.0, lightZ: cameraZ - 6.5 }
    : { backdropZ: chapterZ - 3.5, lightZ: chapterZ + 3.5 };
}
