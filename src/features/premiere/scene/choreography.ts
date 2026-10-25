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
