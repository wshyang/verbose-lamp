import { randomIndex } from '@/shared/lib/random';
import type { LuckyDrawEntry } from './entries';

/**
 * Fairness boundary: the animation never decides the winner. This pick uses
 * crypto entropy; visual randomness uses a separate seeded RNG.
 */
export function pickWinner(
  entries: readonly LuckyDrawEntry[],
  fill: (buf: Uint32Array) => Uint32Array = (buf) => crypto.getRandomValues(buf),
): LuckyDrawEntry {
  return entries[randomIndex(entries.length, fill)];
}