/**
 * Photosensitivity guard (WCAG 2.3.1): never more than 3 large luminance
 * flashes in any 1 s window; every flash attack ≥ 80 ms. Pure; clamps, never
 * throws (ADDENDUM-020 §3.1).
 */
export interface FlashSegment {
  startMs: number;
  attackMs: number;
  holdMs: number;
  decayMs: number;
  peak: number;
}

const MIN_ATTACK_MS = 80;
const LARGE_FLASH_PEAK = 0.6;
const DIMMED_PEAK = 0.3;

export function sanitizeFlashPlan(segments: readonly FlashSegment[]): readonly FlashSegment[] {
  const sorted = [...segments]
    .sort((a, b) => a.startMs - b.startMs)
    .map((s) => ({ ...s, attackMs: Math.max(MIN_ATTACK_MS, s.attackMs) }));
  const accepted: number[] = [];
  return sorted.map((s) => {
    if (s.peak <= LARGE_FLASH_PEAK) return s;
    const recent = accepted.filter((t) => s.startMs - t < 1000);
    if (recent.length >= 3) return { ...s, peak: DIMMED_PEAK };
    accepted.push(s.startMs);
    return s;
  });
}

/** Max number of large flashes whose attacks start inside any 1 s window. */
export function maxFlashRate(segments: readonly FlashSegment[]): number {
  const starts = segments
    .filter((s) => s.peak > LARGE_FLASH_PEAK)
    .map((s) => s.startMs)
    .sort((a, b) => a - b);
  let max = 0;
  for (let i = 0; i < starts.length; i += 1) {
    const count = starts.filter((t) => t >= starts[i] && t - starts[i] < 1000).length;
    max = Math.max(max, count);
  }
  return max;
}

/** Combined flash envelope at time t, in 0..1. */
export function flashIntensityAt(segments: readonly FlashSegment[], t: number): number {
  let level = 0;
  for (const s of segments) {
    const local = t - s.startMs;
    if (local < 0) continue;
    const decayStart = s.attackMs + s.holdMs;
    const end = decayStart + s.decayMs;
    if (local > end) continue;
    let v: number;
    if (local < s.attackMs) v = local / s.attackMs;
    else if (local < decayStart) v = 1;
    else v = 1 - (local - decayStart) / s.decayMs;
    level = Math.max(level, v * s.peak);
  }
  return level;
}