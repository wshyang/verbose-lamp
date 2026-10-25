/**
 * The premiere's timing math, extracted verbatim from GatsbySceneManager's
 * animate loop (ADDENDUM-022 §0.7). Pure functions of sequence time: the
 * scene manager (and any future renderer) only applies what these return,
 * so the choreography can be golden-tested without a GPU. No three import —
 * `smoothstep` below is identical to THREE.MathUtils.smoothstep.
 */

export interface ChapterWindow {
  startTime: number;
  endTime: number;
  zPosition: number;
}

/** Identical to THREE.MathUtils.smoothstep(x, min, max). */
export function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Index of the chapter containing t; the last chapter past the end. */
export function activeChapterIndex(t: number, chapters: readonly ChapterWindow[]): number {
  for (let i = 0; i < chapters.length; i++) {
    if (t >= chapters[i].startTime && t < chapters[i].endTime) return i;
  }
  return chapters.length - 1;
}

export type CardRole = 'standard' | 'finale';

export interface CardPhase {
  drawProgress: number;
  textProgress: number;
  partOpen: number;
  opacity: number;
}

const INVISIBLE: CardPhase = { drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0 };

export interface CardPhaseRequest {
  localT: number;
  role: CardRole;
}

/** Frame draw-on, text wipe, gate parting and fades for one title card. */
export function cardPhase({ localT, role }: CardPhaseRequest): CardPhase {
  if (localT < -0.18 || localT > 1.18) return { ...INVISIBLE };
  const isFinale = role === 'finale';
  const fadeIn = smoothstep(localT, -0.15, 0.04);
  const fadeOut = isFinale
    ? 1.0 - smoothstep(localT, 0.91, 0.995)
    : 1.0 - smoothstep(localT, 0.94, 1.08);
  return {
    drawProgress: smoothstep(localT, -0.04, 0.42),
    textProgress: smoothstep(localT, 0.14, 0.5),
    partOpen: isFinale ? 0 : smoothstep(localT, 0.8, 1.03),
    opacity: fadeIn * fadeOut,
  };
}

export interface CinemaCameraRequest {
  chapters: readonly ChapterWindow[];
  activeIdx: number;
  chapterLocal: number;
  pullback: number;
}

function holdZ(chapter: ChapterWindow, request: CinemaCameraRequest): number {
  const startDist = 12.2 + request.pullback;
  const endDist = 9.0 + request.pullback * 0.85;
  return lerp(chapter.zPosition + startDist, chapter.zPosition + endDist, request.chapterLocal / 0.78);
}

function flyZ(chapter: ChapterWindow, request: CinemaCameraRequest): number {
  const endDist = 9.0 + request.pullback * 0.85;
  const flyFrac = (request.chapterLocal - 0.78) / 0.22;
  const easeFly = flyFrac * flyFrac * (3 - 2 * flyFrac);
  const nextIsFinale = request.activeIdx + 1 === request.chapters.length - 1;
  const nextStartDist = (nextIsFinale ? 15.2 : 12.2) + request.pullback;
  const nextZ = request.chapters[request.activeIdx + 1].zPosition + nextStartDist;
  return lerp(chapter.zPosition + endDist, nextZ, easeFly);
}

function finaleZ(chapter: ChapterWindow, request: CinemaCameraRequest): number {
  const heroStart = 15.2 + request.pullback;
  const heroHold = 12.4 + request.pullback;
  const easeHero = 1 - Math.pow(1 - Math.min(1, request.chapterLocal / 0.52), 2.5);
  return lerp(chapter.zPosition + heroStart, chapter.zPosition + heroHold, easeHero) - request.chapterLocal * 0.75;
}

/** The directed camera's Z: stately push-in, fly-through, finale hold. */
export function cinemaCameraZ(request: CinemaCameraRequest): number {
  const chapter = request.chapters[request.activeIdx];
  if (request.activeIdx === request.chapters.length - 1) return finaleZ(chapter, request);
  return request.chapterLocal < 0.78 ? holdZ(chapter, request) : flyZ(chapter, request);
}

export interface GreenLightState {
  intensity: number;
  z: number;
}

/** The distant green light: Act I beacon, fading out, finale bookend. */
export function greenLight(t: number, heroZ: number): GreenLightState {
  const act1Green = 1.0 - smoothstep(t, 4.8, 7.6);
  const finaleBookend = smoothstep(t, 34.8, 37.6) * 0.65;
  return { intensity: Math.max(act1Green, finaleBookend), z: t > 30 ? heroZ - 7.5 : -7.5 };
}

/** Silver-nitrate strength during the opening (0.82 at t=0, gone by 2.55 s). */
export function openingNitrate(t: number): number {
  return (1.0 - smoothstep(t, 0.35, 2.55)) * 0.82;
}

/** Nitrate strength when the 1920s look is forced from the header. */
export const FORCED_NITRATE = 0.92;

export interface SearchlightSway {
  left: number;
  right: number;
}

export function searchlightSway(elapsed: number): SearchlightSway {
  return {
    left: -0.36 + Math.sin(elapsed * 0.38) * 0.14,
    right: 0.36 + Math.cos(elapsed * 0.33) * 0.14,
  };
}

export type Vec3Tuple = readonly [number, number, number];

export interface LightRigPositions {
  key: Vec3Tuple;
  rim: Vec3Tuple;
  cool: Vec3Tuple;
}

/** The three moving point lights, orbiting the focus depth. */
export function lightRig(elapsed: number, focusZ: number): LightRigPositions {
  return {
    key: [Math.sin(elapsed * 0.75) * 5.5, 2.6 + Math.cos(elapsed * 0.5) * 1.4, focusZ + 3.2],
    rim: [Math.cos(elapsed * 0.62) * -6.0, -2.2 + Math.sin(elapsed * 0.55) * 1.5, focusZ + 1.5],
    cool: [0, 4.5, focusZ - 2.0],
  };
}

export interface RigAnchorsRequest {
  cameraMode: 'cinema' | 'orbit';
  cameraZ: number;
  chapterZ: number;
}

export interface RigAnchors {
  backdropZ: number;
  lightZ: number;
}

/** Where the backdrop wall and light focus sit for the current camera mode. */
export function rigAnchors({ cameraMode, cameraZ, chapterZ }: RigAnchorsRequest): RigAnchors {
  if (cameraMode === 'cinema') return { backdropZ: cameraZ - 12.0, lightZ: cameraZ - 6.5 };
  return { backdropZ: chapterZ - 3.5, lightZ: chapterZ + 3.5 };
}
