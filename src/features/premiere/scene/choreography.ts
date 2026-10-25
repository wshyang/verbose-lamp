import type { CameraMode } from '../model/types';

/**
 * The premiere's timing and staging maths, lifted out of the imperative scene manager's
 * `animate()` (ADDENDUM-022 §4.0.7). Nothing here imports `three`: the arithmetic is the
 * same as the shipped manager's, and the sampled golden test in `choreography.test.ts`
 * pins it down. Every function is pure: seconds in, numbers out.
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

/** Same arithmetic as `THREE.MathUtils.lerp`, kept bit-identical to what shipped. */
export function lerp(x: number, y: number, t: number): number {
  return (1 - t) * x + t * y;
}

export interface ChapterTiming {
  readonly startTime: number;
  readonly endTime: number;
  readonly zPosition: number;
}

/** Local progress through a chapter: 0 at its start, 1 at its end, unclamped outside it. */
export function chapterProgress(t: number, chapter: ChapterTiming): number {
  return (t - chapter.startTime) / (chapter.endTime - chapter.startTime);
}

/** The chapter that owns time `t`; anything outside the sequence reads as the finale. */
export function activeChapterIndex(t: number, chapters: readonly ChapterTiming[]): number {
  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index];
    if (t >= chapter.startTime && t < chapter.endTime) return index;
  }
  return chapters.length - 1;
}

/** The two staging roles a card can play. The finale holds its gate shut and fades out sooner. */
export type CardRole = 'standard' | 'finale';

/** Only the last chapter is the finale. */
export function cardRole(index: number, chapterCount: number): CardRole {
  return index === chapterCount - 1 ? 'finale' : 'standard';
}

/** The draw-on, text wipe, gate parting and fade of one card. All 0 when off-stage. */
export interface CardPhase {
  readonly drawProgress: number;
  readonly textProgress: number;
  readonly partOpen: number;
  readonly opacity: number;
}

export interface CardPhaseRequest {
  /** 0 is the card's first instant, 1 its last. */
  readonly localT: number;
  readonly role: CardRole;
}

/** A card is only staged within this distance outside its own 0..1 life. */
export const CARD_WINDOW = 0.18;

const OFF_STAGE: CardPhase = { drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0 };

function fadeOpacity(localT: number, role: CardRole): number {
  const fadeIn = smoothstep(localT, -0.15, 0.04);
  const fadeOut =
    role === 'finale' ? 1 - smoothstep(localT, 0.91, 0.995) : 1 - smoothstep(localT, 0.94, 1.08);
  return fadeIn * fadeOut;
}

export function cardPhase({ localT, role }: CardPhaseRequest): CardPhase {
  if (localT < -CARD_WINDOW || localT > 1 + CARD_WINDOW) return OFF_STAGE;
  return {
    drawProgress: smoothstep(localT, -0.04, 0.42),
    textProgress: smoothstep(localT, 0.14, 0.5),
    // The finale holds its gate shut; every other act parts it as the camera flies through.
    partOpen: role === 'finale' ? 0 : smoothstep(localT, 0.8, 1.03),
    opacity: fadeOpacity(localT, role),
  };
}

export interface CinemaCameraRequest {
  readonly chapters: readonly ChapterTiming[];
  readonly activeIdx: number;
  /** Time inside the active chapter, clamped to 0..1. */
  readonly chapterLocal: number;
  /** Extra framing distance so narrow viewports never clip the side wings. */
  readonly pullback: number;
}

/** The hold fills the first 78 % of a chapter; the fly-through takes the rest. */
const HOLD_END = 0.78;
const HOLD_START_DISTANCE = 12.2;
const HOLD_END_DISTANCE = 9.0;
/** The fly-through lands further back before the finale so the whole crown reads. */
const FINALE_APPROACH_DISTANCE = 15.2;
/** Pull-back is only partly applied at the end of a hold. */
const END_PULLBACK_SHARE = 0.85;
const HERO_START_DISTANCE = 15.2;
const HERO_HOLD_DISTANCE = 12.4;
/** The finale settles into its hold over the first 52 % of its time. */
const HERO_SETTLE_END = 0.52;
const HERO_SETTLE_POWER = 2.5;
const HERO_DRIFT_PER_CHAPTER = 0.75;

/** The cinema camera's Z for this instant: hold, fly-through, or the grand finale. */
export function cinemaCameraZ(request: CinemaCameraRequest): number {
  const { chapters, activeIdx, chapterLocal, pullback } = request;
  const chapter = chapters[activeIdx];
  if (activeIdx === chapters.length - 1) return finaleCameraZ(chapter.zPosition, chapterLocal, pullback);
  if (chapterLocal < HOLD_END) return holdCameraZ(chapter.zPosition, chapterLocal, pullback);
  return flyCameraZ(request);
}

/** Stately push-in across the hold. */
function holdCameraZ(chapterZ: number, chapterLocal: number, pullback: number): number {
  const startDistance = HOLD_START_DISTANCE + pullback;
  const endDistance = HOLD_END_DISTANCE + pullback * END_PULLBACK_SHARE;
  return lerp(chapterZ + startDistance, chapterZ + endDistance, chapterLocal / HOLD_END);
}

/** Exhilarating fly-through portal into the next chamber. */
function flyCameraZ({ chapters, activeIdx, chapterLocal, pullback }: CinemaCameraRequest): number {
  const endDistance = HOLD_END_DISTANCE + pullback * END_PULLBACK_SHARE;
  const flyFraction = (chapterLocal - HOLD_END) / (1 - HOLD_END);
  const eased = flyFraction * flyFraction * (3 - 2 * flyFraction);
  const nextIsFinale = activeIdx + 1 === chapters.length - 1;
  const nextStartDistance = (nextIsFinale ? FINALE_APPROACH_DISTANCE : HOLD_START_DISTANCE) + pullback;
  const nextZ = chapters[activeIdx + 1].zPosition + nextStartDistance;
  return lerp(chapters[activeIdx].zPosition + endDistance, nextZ, eased);
}

/** The finale frames the whole Chrysler crown, then drifts in for the fade. */
function finaleCameraZ(chapterZ: number, chapterLocal: number, pullback: number): number {
  const settle = 1 - Math.pow(1 - Math.min(1, chapterLocal / HERO_SETTLE_END), HERO_SETTLE_POWER);
  const from = chapterZ + HERO_START_DISTANCE + pullback;
  const to = chapterZ + HERO_HOLD_DISTANCE + pullback;
  return lerp(from, to, settle) - chapterLocal * HERO_DRIFT_PER_CHAPTER;
}

/** The level the manual 1920s toggle forces. */
export const FORCED_NITRATE = 0.92;

/** How much of the opening's nitrate look actually reaches the shader. */
export const OPENING_NITRATE_GAIN = 0.82;

const NITRATE_FADE_START = 0.35;
const NITRATE_FADE_END = 2.55;

/** The 1920s silver-nitrate opening: full strength, gone by 2.55 s. */
export function openingNitrate(t: number): number {
  return 1 - smoothstep(t, NITRATE_FADE_START, NITRATE_FADE_END);
}

export type NitrateMode = 'auto' | 'forced';

/** Nitrate mix for the shader: the manual toggle forces the look, otherwise the opener fades out. */
export function nitrateLevel(t: number, mode: NitrateMode): number {
  return mode === 'forced' ? FORCED_NITRATE : openingNitrate(t) * OPENING_NITRATE_GAIN;
}

export interface GreenLight {
  /** 0..1; the mesh hides itself below 0.01. */
  readonly intensity: number;
  readonly z: number;
}

/** Act I's green light sits here, behind the signet gate. */
export const GREEN_LIGHT_ACT1_Z = -7.5;
/** After this time the light moves to the finale card (strictly after, not at). */
export const GREEN_LIGHT_HANDOVER_T = 30;
/** …and sits this far behind the finale card. */
const GREEN_LIGHT_BEHIND_HERO = 7.5;
const ACT1_FADE_START = 4.8;
const ACT1_FADE_END = 7.6;
const BOOKEND_START = 34.8;
const BOOKEND_END = 37.6;
const BOOKEND_LEVEL = 0.65;

/** Prominent behind the Act I gate, then a subtle bookend behind the finale. */
export function greenLight(t: number, heroZ: number): GreenLight {
  const act1 = 1 - smoothstep(t, ACT1_FADE_START, ACT1_FADE_END);
  const bookend = smoothstep(t, BOOKEND_START, BOOKEND_END) * BOOKEND_LEVEL;
  return {
    intensity: Math.max(act1, bookend),
    z: t > GREEN_LIGHT_HANDOVER_T ? heroZ - GREEN_LIGHT_BEHIND_HERO : GREEN_LIGHT_ACT1_Z,
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

/** The three moving point lights, orbiting the focus plane so the bevelled gold gleams. */
export function lightRig(elapsed: number, focusZ: number): LightRig {
  return {
    key: [Math.sin(elapsed * 0.75) * 5.5, 2.6 + Math.cos(elapsed * 0.5) * 1.4, focusZ + 3.2],
    rim: [Math.cos(elapsed * 0.62) * -6.0, -2.2 + Math.sin(elapsed * 0.55) * 1.5, focusZ + 1.5],
    cool: [0, 4.5, focusZ - 2.0],
  };
}

export interface RigAnchorsRequest {
  readonly cameraMode: CameraMode;
  readonly cameraZ: number;
  readonly chapterZ: number;
}

export interface RigAnchors {
  readonly backdropZ: number;
  readonly lightZ: number;
}

/** Where the wallpaper and the lighting rig hang: with the camera, or with the card in orbit. */
export function rigAnchors({ cameraMode, cameraZ, chapterZ }: RigAnchorsRequest): RigAnchors {
  return cameraMode === 'cinema'
    ? { backdropZ: cameraZ - 12.0, lightZ: cameraZ - 6.5 }
    : { backdropZ: chapterZ - 3.5, lightZ: chapterZ + 3.5 };
}
