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
