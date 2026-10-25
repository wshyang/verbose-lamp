import type { CameraMode } from '../model/types';

/**
 * The premiere's timing and staging math, lifted out of the imperative scene manager's `animate()` (ADDENDUM-027)
 * verbatim (ADDENDUM-022 §4.0.7). Nothing here imports `three`: the arithmetic is the
 * same, and the sampled golden test in `choreography.test.ts` pins it down.
 */

/** Same arithmetic as `THREE.MathUtils.smoothstep`. */
export function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
}

/** Same arithmetic as `THREE.MathUtils.clamp`. */
export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Same arithmetic as `THREE.MathUtils.lerp`. */
export function lerp(x: number, y: number, t: number): number {
  return (1 - t) * x + t * y;
}

export interface ChapterTiming {
  readonly startTime: number;
  readonly endTime: number;
  readonly zPosition: number;
}

/** The chapter that owns time `t`; anything outside the sequence reads as the finale. */
export function activeChapterIndex(t: number, chapters: readonly ChapterTiming[]): number {
  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index];
    if (t >= chapter.startTime && t < chapter.endTime) return index;
  }
  return chapters.length - 1;
}

/** The draw-on, text wipe, gate parting and fade of one card. All 0 when off-stage. */
export interface CardPhase {
  readonly drawProgress: number;
  readonly textProgress: number;
  readonly partOpen: number;
  readonly opacity: number;
}

/** A card is only staged between these local times. */
export const CARD_WINDOW = 0.18;

export function cardPhase(localT: number, isFinale: boolean): CardPhase {
  if (localT < -CARD_WINDOW || localT > 1 + CARD_WINDOW) {
    return { drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0 };
  }
  const fadeIn = smoothstep(localT, -0.15, 0.04);
  const fadeOut = isFinale
    ? 1 - smoothstep(localT, 0.91, 0.995)
    : 1 - smoothstep(localT, 0.94, 1.08);
  return {
    drawProgress: smoothstep(localT, -0.04, 0.42),
    textProgress: smoothstep(localT, 0.14, 0.5),
    // The finale holds its gate shut; every other act parts it as the camera flies through.
    partOpen: isFinale ? 0 : smoothstep(localT, 0.8, 1.03),
    opacity: fadeIn * fadeOut,
  };
}

export interface CinemaCameraInput {
  readonly chapters: readonly ChapterTiming[];
  readonly activeIdx: number;
  /** Time inside the active chapter, clamped to 0..1. */
  readonly chapterLocal: number;
  /** Extra framing distance for narrow viewports. */
  readonly pullback: number;
}

/** The cinema camera's Z for this instant: hold, fly-through, or the grand finale. */
export function cinemaCameraZ({
  chapters,
  activeIdx,
  chapterLocal,
  pullback,
}: CinemaCameraInput): number {
  const chapter = chapters[activeIdx];
  if (activeIdx === chapters.length - 1) return finaleCameraZ(chapter.zPosition, chapterLocal, pullback);
  if (chapterLocal < 0.78) return holdCameraZ(chapter.zPosition, chapterLocal, pullback);
  return flyCameraZ(chapters, activeIdx, chapterLocal, pullback);
}

/** Stately push-in across the hold: 12.2 → 9.0 device units. */
function holdCameraZ(chapterZ: number, chapterLocal: number, pullback: number): number {
  const startDist = 12.2 + pullback;
  const endDist = 9.0 + pullback * 0.85;
  return lerp(chapterZ + startDist, chapterZ + endDist, chapterLocal / 0.78);
}

/** Exhilarating fly-through portal into the next chamber (0.78 → 1). */
function flyCameraZ(
  chapters: readonly ChapterTiming[],
  activeIdx: number,
  chapterLocal: number,
  pullback: number,
): number {
  const endDist = 9.0 + pullback * 0.85;
  const flyFrac = (chapterLocal - 0.78) / 0.22;
  const easeFly = flyFrac * flyFrac * (3 - 2 * flyFrac);
  const nextIsFinale = activeIdx + 1 === chapters.length - 1;
  const nextStartDist = (nextIsFinale ? 15.2 : 12.2) + pullback;
  const nextZ = chapters[activeIdx + 1].zPosition + nextStartDist;
  return lerp(chapters[activeIdx].zPosition + endDist, nextZ, easeFly);
}

/** The finale frames the whole Chrysler crown, then drifts in for the fade. */
function finaleCameraZ(chapterZ: number, chapterLocal: number, pullback: number): number {
  const heroStart = 15.2 + pullback;
  const heroHold = 12.4 + pullback;
  const easeHero = 1 - Math.pow(1 - Math.min(1, chapterLocal / 0.52), 2.5);
  return lerp(chapterZ + heroStart, chapterZ + heroHold, easeHero) - chapterLocal * 0.75;
}

/** Nitrate strength the manual toggle forces. */
export const FORCED_NITRATE = 0.92;

/** How much of the opening's nitrate look actually reaches the shader. */
export const OPENING_NITRATE_GAIN = 0.82;

/** The 1920s silver-nitrate opening: full strength, gone by 2.55 s. */
export function openingNitrate(t: number): number {
  return 1.0 - smoothstep(t, 0.35, 2.55);
}

/** Nitrate mix for the shader: the manual toggle forces the look, otherwise the opener fades out. */
export function nitrateStrength(t: number, forced: boolean): number {
  return forced ? FORCED_NITRATE : openingNitrate(t) * OPENING_NITRATE_GAIN;
}

export interface GreenLight {
  /** 0..1 mix of the green shader. */
  readonly intensity: number;
  readonly z: number;
}

/** Act I's green light sits this far behind the camera's world origin. */
export const GREEN_LIGHT_ACT1_Z = -7.5;
/** …and this far behind the finale card once it becomes the bookend. */
export const GREEN_LIGHT_HERO_OFFSET = 7.5;
/** After this time the green light has moved to the finale card. */
export const GREEN_LIGHT_HANDOVER_T = 30;

/** Prominent behind the Act I gate, then a subtle bookend in the finale. */
export function greenLight(t: number, heroZ: number): GreenLight {
  const act1Green = 1.0 - smoothstep(t, 4.8, 7.6);
  const finaleBookend = smoothstep(t, 34.8, 37.6) * 0.65;
  return {
    intensity: Math.max(act1Green, finaleBookend),
    z: t > GREEN_LIGHT_HANDOVER_T ? heroZ - GREEN_LIGHT_HERO_OFFSET : GREEN_LIGHT_ACT1_Z,
  };
}

export interface SearchlightSway {
  readonly left: number;
  readonly right: number;
}

/** Slow counter-phase sway of the two premiere searchlights (radians). */
export function searchlightSway(elapsed: number): SearchlightSway {
  return {
    left: -0.36 + Math.sin(elapsed * 0.38) * 0.14,
    right: 0.36 + Math.cos(elapsed * 0.33) * 0.14,
  };
}

export type Vec3 = readonly [number, number, number];

export interface LightRig {
  readonly key: Vec3;
  readonly rim: Vec3;
  readonly cool: Vec3;
}

/** The three moving point lights, orbiting the active card so the bevelled gold gleams. */
export function lightRig(elapsed: number, focusZ: number): LightRig {
  return {
    key: [Math.sin(elapsed * 0.75) * 5.5, 2.6 + Math.cos(elapsed * 0.5) * 1.4, focusZ + 3.2],
    rim: [Math.cos(elapsed * 0.62) * -6.0, -2.2 + Math.sin(elapsed * 0.55) * 1.5, focusZ + 1.5],
    cool: [0, 4.5, focusZ - 2.0],
  };
}

export interface RigAnchorsInput {
  readonly cameraMode: CameraMode;
  readonly cameraZ: number;
  readonly chapterZ: number;
}

export interface RigAnchors {
  readonly backdropZ: number;
  readonly lightZ: number;
}

/** Where the wallpaper and the lighting rig hang: with the camera, or with the card in orbit. */
export function rigAnchors({ cameraMode, cameraZ, chapterZ }: RigAnchorsInput): RigAnchors {
  return cameraMode === 'cinema'
    ? { backdropZ: cameraZ - 12.0, lightZ: cameraZ - 6.5 }
    : { backdropZ: chapterZ - 3.5, lightZ: chapterZ + 3.5 };
}
