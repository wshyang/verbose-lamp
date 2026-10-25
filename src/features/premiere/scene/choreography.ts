/**
 * Pure premiere choreography (ADDENDUM-022 §0.7): every timing decision the
 * renderer makes, with no `three` import, so the numbers are unit-tested and
 * golden-sampled. The renderer (imperative or React Three Fiber) only applies
 * these values to scene objects. Moved verbatim from `GatsbySceneManager.animate`.
 */
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';

export interface ChapterTiming {
  startTime: number;
  endTime: number;
  zPosition: number;
}

export interface CardPhase {
  drawProgress: number;
  textProgress: number;
  partOpen: number;
  opacity: number;
}

export type Vec3 = readonly [number, number, number];

const CARD_RANGE = { min: -0.18, max: 1.18 } as const;
const HOLD_END = 0.78;
const FINALE_EASE_SPAN = 0.52;

/** Identical to `THREE.MathUtils.smoothstep(x, min, max)`. */
export function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface ActiveChapterQuery {
  time: number;
  chapters: readonly ChapterTiming[];
}

export function activeChapterIndex({ time, chapters }: ActiveChapterQuery): number {
  for (let i = 0; i < chapters.length; i += 1) {
    const chapter = chapters[i];
    if (time >= chapter.startTime && time < chapter.endTime) return i;
  }
  return chapters.length - 1;
}

export interface ChapterProgressQuery {
  time: number;
  chapter: ChapterTiming;
}

/** Unclamped local progress: 0 at the chapter start, 1 at its end. */
export function chapterProgress({ time, chapter }: ChapterProgressQuery): number {
  return (time - chapter.startTime) / (chapter.endTime - chapter.startTime);
}

export interface CardPhaseQuery {
  localT: number;
  variant: 'standard' | 'finale';
}

const ZERO_PHASE: CardPhase = { drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0 };

export function cardPhase({ localT, variant }: CardPhaseQuery): CardPhase {
  if (localT < CARD_RANGE.min || localT > CARD_RANGE.max) return { ...ZERO_PHASE };
  const isFinale = variant === 'finale';
  const fadeIn = smoothstep(localT, -0.15, 0.04);
  const fadeOut = isFinale
    ? 1 - smoothstep(localT, 0.91, 0.995)
    : 1 - smoothstep(localT, 0.94, 1.08);
  return {
    drawProgress: smoothstep(localT, -0.04, 0.42),
    textProgress: smoothstep(localT, 0.14, 0.5),
    partOpen: isFinale ? 0 : smoothstep(localT, 0.8, 1.03),
    opacity: fadeIn * fadeOut,
  };
}

export interface CinemaCameraQuery {
  chapters: readonly ChapterTiming[];
  activeIndex: number;
  chapterLocal: number;
  pullback: number;
}

function holdCameraZ(query: CinemaCameraQuery): number {
  const { chapters, activeIndex, chapterLocal, pullback } = query;
  const active = chapters[activeIndex];
  const startDist = 12.2 + pullback;
  const endDist = 9.0 + pullback * 0.85;
  return lerp(active.zPosition + startDist, active.zPosition + endDist, chapterLocal / HOLD_END);
}

function flyCameraZ(query: CinemaCameraQuery): number {
  const { chapters, activeIndex, chapterLocal, pullback } = query;
  const active = chapters[activeIndex];
  const flyFrac = (chapterLocal - HOLD_END) / (1 - HOLD_END);
  const easeFly = flyFrac * flyFrac * (3 - 2 * flyFrac);
  const nextIsFinale = activeIndex + 1 === chapters.length - 1;
  const nextStartDist = (nextIsFinale ? 15.2 : 12.2) + pullback;
  const nextZ = chapters[activeIndex + 1].zPosition + nextStartDist;
  return lerp(active.zPosition + 9.0 + pullback * 0.85, nextZ, easeFly);
}

function finaleCameraZ(query: CinemaCameraQuery): number {
  const { chapters, activeIndex, chapterLocal, pullback } = query;
  const active = chapters[activeIndex];
  const easeHero = 1 - Math.pow(1 - Math.min(1, chapterLocal / FINALE_EASE_SPAN), 2.5);
  const start = active.zPosition + 15.2 + pullback;
  const hold = active.zPosition + 12.4 + pullback;
  return lerp(start, hold, easeHero) - chapterLocal * 0.75;
}

/** The directed fly-through camera Z for the active chapter. */
export function cinemaCameraZ(query: CinemaCameraQuery): number {
  if (query.activeIndex === query.chapters.length - 1) return finaleCameraZ(query);
  return query.chapterLocal < HOLD_END ? holdCameraZ(query) : flyCameraZ(query);
}

export interface GreenLightQuery {
  time: number;
  heroZ: number;
}

export function greenLight({ time, heroZ }: GreenLightQuery): { intensity: number; z: number } {
  const act1Green = 1 - smoothstep(time, 4.8, 7.6);
  const finaleBookend = smoothstep(time, 34.8, 37.6) * 0.65;
  return {
    intensity: Math.max(act1Green, finaleBookend),
    z: time > 30 ? heroZ - 7.5 : -7.5,
  };
}

/** Silver-nitrate level of the opening dissolve (0.82 at t=0, 0 after 2.55 s). */
export function openingNitrate(time: number): number {
  return (1 - smoothstep(time, 0.35, 2.55)) * 0.82;
}

export const FORCED_NITRATE = 0.92;

export interface NitrateQuery {
  time: number;
  mode: 'auto' | 'forced';
}

export function nitrateLevel({ time, mode }: NitrateQuery): number {
  return mode === 'forced' ? FORCED_NITRATE : openingNitrate(time);
}

export function searchlightSway(elapsed: number): { left: number; right: number } {
  return {
    left: -0.36 + Math.sin(elapsed * 0.38) * 0.14,
    right: 0.36 + Math.cos(elapsed * 0.33) * 0.14,
  };
}

export interface LightRigQuery {
  elapsed: number;
  focusZ: number;
}

export function lightRig({ elapsed, focusZ }: LightRigQuery): { key: Vec3; rim: Vec3; cool: Vec3 } {
  return {
    key: [Math.sin(elapsed * 0.75) * 5.5, 2.6 + Math.cos(elapsed * 0.5) * 1.4, focusZ + 3.2],
    rim: [Math.cos(elapsed * 0.62) * -6.0, -2.2 + Math.sin(elapsed * 0.55) * 1.5, focusZ + 1.5],
    cool: [0, 4.5, focusZ - 2.0],
  };
}

export interface RigAnchorsQuery {
  cameraMode: 'cinema' | 'orbit';
  cameraZ: number;
  chapterZ: number;
}

export function rigAnchors({ cameraMode, cameraZ, chapterZ }: RigAnchorsQuery) {
  return cameraMode === 'cinema'
    ? { backdropZ: cameraZ - 12.0, lightZ: cameraZ - 6.5 }
    : { backdropZ: chapterZ - 3.5, lightZ: chapterZ + 3.5 };
}

export interface AdvanceTimeQuery {
  currentTime: number;
  dt: number;
  mode: 'playing' | 'paused' | 'frozen';
  frozenTime?: number;
  duration?: number;
}

const MAX_FRAME_DT = 0.05;

/** One playback step: capped dt, wrap to 0 at the end (not modulo). */
export function advanceTime(query: AdvanceTimeQuery): number {
  if (query.mode === 'frozen') return query.frozenTime ?? query.currentTime;
  if (query.mode === 'paused') return query.currentTime;
  const next = query.currentTime + Math.min(MAX_FRAME_DT, query.dt);
  const duration = query.duration ?? TOTAL_SEQUENCE_DURATION;
  return next >= duration ? 0 : next;
}

export interface SmoothPointerQuery {
  current: { x: number; y: number };
  target: { x: number; y: number };
  dt: number;
}

export function smoothPointer({ current, target, dt }: SmoothPointerQuery) {
  const amount = Math.min(1, dt * 4.5);
  return {
    x: lerp(current.x, target.x, clamp01(amount)),
    y: lerp(current.y, target.y, clamp01(amount)),
  };
}
