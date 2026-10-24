import type { AppDatabase } from '../db/client.js';
import { readLeaderboardView } from './leaderboardView.js';
import { hasStatusSubscribers, publishLeaderboard } from './statusBus.js';

/**
 * ADR-131 (B6) — push the board after a result changed.
 *
 * `publishFeedMatch` is free because its caller already holds the view. This one is not: cluster
 * standings are an aggregate, so somebody has to compute them. Three things keep that honest.
 *
 * It is gated on `hasStatusSubscribers()`, because the expensive half is *computing* the payload
 * and an `EventEmitter` only makes the *emitting* free — Design §6 trap 3, the same reasoning
 * that gates the up-soon watcher. Before the event and after it, this costs one boolean.
 *
 * It runs after the write that voided `SCOREBOARD_TAG`, so the reads below repopulate a cache
 * the next HTTP reader would have had to fill anyway. The work is not added, it is moved earlier.
 *
 * And it is deliberately NOT on the per-point path: ADR-120 moved the live scoreline to
 * `LIVE_MATCH_TAG`, leaving `SCOREBOARD_TAG` voided by completion and correction only — a few
 * dozen times an afternoon. That is what retired the throttling question; do not reintroduce it.
 */
export async function pushLeaderboard(db: AppDatabase): Promise<void> {
  if (!hasStatusSubscribers()) return;
  /*
   * ADR-135 — the same builder the HTTP route uses, so "the frame is the response" is now true
   * of the bytes and not merely of the shape. It also fills the memo this push just voided,
   * which is what the paragraph above means by moving the work earlier rather than adding it.
   */
  publishLeaderboard(await readLeaderboardView(db));
}
