import type { LeaderboardView, MatchView } from '@psd/contracts';

/**
 * ADR-132 — where a pushed match or board waits for whichever surface wants it.
 *
 * The status stream is opened once, by `useAlertsStore`, for the whole shell. The board and
 * the match feed are different hooks on a different page, mounted and unmounted as the
 * participant navigates. Something has to sit between them that is neither, and outlives both:
 * a module-level store, subscribed to with the component lifecycle and written to by the one
 * socket.
 *
 * It is deliberately NOT part of `AlertsStore`. That store answers "does anything need the
 * participant's attention", and a leaderboard does not; folding board payloads into it would
 * make every nav dot re-render when a score changed on a court nobody is watching.
 *
 * The last frame of each kind is retained rather than only forwarded, so a surface that mounts
 * *after* a frame arrived still gets it. Without that, navigating to the board a second later
 * than the push shows yesterday's answer until the next poll — which is exactly the gap the
 * push exists to close.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

interface LiveBoardState {
  /** Every match pushed since the page loaded, newest value per id. */
  matches: MatchView[];
  leaderboard: LeaderboardView | null;
}

let state: LiveBoardState = { matches: [], leaderboard: null };

function announce(): void {
  for (const listener of [...listeners]) listener();
}

export function subscribeToLiveBoard(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * `useSyncExternalStore` compares snapshots by identity, so this must return the SAME object
 * until something actually changes. Building a fresh one per call is the classic way to make
 * React re-render forever.
 */
export function liveBoardSnapshot(): LiveBoardState {
  return state;
}

export function applyLiveMatch(match: MatchView): void {
  const matches = state.matches.filter((item) => item.id !== match.id);
  matches.push(match);
  state = { ...state, matches };
  announce();
}

export function applyLiveLeaderboard(leaderboard: LeaderboardView): void {
  state = { ...state, leaderboard };
  announce();
}

/** Test seam, and the sign-out path: nothing from one session may be read by the next. */
export function resetLiveBoard(): void {
  state = { matches: [], leaderboard: null };
  announce();
}

/**
 * ADR-132 — fold pushed matches into the polled feed, preserving the server's order.
 *
 * **This mirrors `/api/tournament/matches/feed` and will drift if that changes.** The server
 * builds it as `[...readLiveMatches, ...readCompletedMatches]`, each ordered by `started_at`
 * DESC — so `in_progress` first, then `completed`, and **`cancelled` appears in neither**. The
 * duplication is unavoidable once a frame can arrive without a re-fetch, so it is written in
 * one place, named after the thing it mirrors, and tested against each of those three rules.
 * `mergeById` in `liveRoom.ts` is not reusable here: it sorts by id, which for a chat log is
 * chronological order and for this list is nonsense.
 *
 * A match the client has never seen is INSERTED, not dropped — a phone that opens the feed
 * mid-afternoon learns about a court starting from the frame alone.
 */
const FEED_RANK: Partial<Record<MatchView['status'], number>> = { in_progress: 0, completed: 1 };

export function mergeMatchFeed(
  polled: readonly MatchView[],
  pushed: readonly MatchView[],
): MatchView[] {
  const byId = new Map(polled.map((match) => [match.id, match]));
  for (const match of pushed) byId.set(match.id, match);

  /*
   * Ranked first, then sorted, so the comparator never has to ask whether a status belongs in
   * the feed — a question already answered here. Written the other way round it needed a
   * `?? 0` fallback on each side that no input could reach, which is a defensive arm and gets
   * deleted rather than tested (ADR-013).
   */
  const ranked: { rank: number; match: MatchView }[] = [];
  for (const match of byId.values()) {
    const rank = FEED_RANK[match.status];
    // `cancelled` is in neither of the server's two queries, so it is in neither feed.
    if (rank === undefined) continue;
    ranked.push({ rank, match });
  }

  return ranked
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      // Same shape as the server's `desc(started_at)`; ISO strings sort lexically by time.
      const [a, b] = [left.match, right.match];
      if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    })
    .map((entry) => entry.match);
}
