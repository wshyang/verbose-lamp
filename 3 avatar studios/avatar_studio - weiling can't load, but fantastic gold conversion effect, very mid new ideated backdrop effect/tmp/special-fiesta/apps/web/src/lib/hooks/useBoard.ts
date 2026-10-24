import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { ClusterCode, ClusterStandingView, IndividualStandingView } from '@psd/contracts';
import {
  fetchAgenda, fetchBracket, fetchLeaderboard, fetchLineups, fetchMatchFeed } from '../api/participants.js';
import { fetchMyTeam } from '../api/teams.js';
import { formatTime, roundPoints } from '../format.js';
import {
  liveBoardSnapshot,
  mergeMatchFeed,
  subscribeToLiveBoard,
} from '../live/boardLive.js';
import { POLL_MIN_MS, usePolling } from './useAsyncData.js';
import { useLocalCachedData } from './useLocalCachedData.js';
import { MY_TEAM_CACHE, MY_TEAM_TTL_MS } from '../storage/cacheNames.js';

/** S5 cluster leaderboard and S60 shared match feed. Both auto-refresh (F9, F51). */

export interface BoardRow extends ClusterStandingView {
  /** 0–100, relative to the leader — drives the bar width without arithmetic in JSX. */
  sharePercent: number;
  isViewerCluster: boolean;
  /**
   * ADR-029 — set on the cluster that reached a shared score first. Without it, two rows
   * on the same points look mis-ranked; with it, the board says why one is ahead.
   */
  tieNote: string | null;
}

/**
 * The first row of a group that shares a score gets "first to 83"; the rest get nothing.
 * Zero-point clusters are not a tie worth explaining.
 */
function tieNoteFor(
  clusters: readonly ClusterStandingView[],
  row: ClusterStandingView,
  index: number,
): string | null {
  if (row.totalPoints === 0) return null;
  const sharesScore = clusters.some(
    (other) => other.clusterCode !== row.clusterCode && other.totalPoints === row.totalPoints,
  );
  if (!sharesScore) return null;
  const isFirstOfGroup = clusters[index - 1]?.totalPoints !== row.totalPoints;
  return isFirstOfGroup ? `first to ${roundPoints(row.totalPoints)}` : null;
}

/**
 * ADR-132 — whatever the socket has pushed since the page loaded.
 *
 * `useSyncExternalStore` rather than a `useEffect` + `useState` pair because the store is
 * genuinely external: it is written by a socket the shell owns, not by this component's own
 * lifecycle, and React's own subscription primitive is the one that cannot tear during a
 * concurrent render.
 */
function useLiveBoard() {
  return useSyncExternalStore(subscribeToLiveBoard, liveBoardSnapshot, liveBoardSnapshot);
}

export function useLeaderboard(viewerClusterCode: ClusterCode | null) {
  const state = useLocalCachedData({
    name: 'leaderboard',
    loader: useCallback(() => fetchLeaderboard(), []),
    // ADR-113: the next regular poll cannot arrive before this, so a tab hop need not either.
    ttlMs: POLL_MIN_MS,
  });
  usePolling(state.reload);

  const live = useLiveBoard();
  /*
   * The pushed board wins when it is newer than the polled one. Compared on `generatedAt`
   * rather than assumed: a poll that lands after a push would otherwise overwrite the fresher
   * answer with a staler one, which is the push making things worse.
   */
  const board = useMemo(() => {
    if (live.leaderboard === null) return state.data;
    if (state.data === null) return live.leaderboard;
    return live.leaderboard.generatedAt >= state.data.generatedAt ? live.leaderboard : state.data;
  }, [live.leaderboard, state.data]);

  const rows = useMemo<BoardRow[]>(() => {
    const clusters = board?.clusters ?? [];
    const leaderPoints = clusters.reduce((best, row) => Math.max(best, row.totalPoints), 0);
    return clusters.map((row, index) => ({
      ...row,
      sharePercent: leaderPoints === 0 ? 0 : Math.round((row.totalPoints / leaderPoints) * 100),
      isViewerCluster: row.clusterCode === viewerClusterCode,
      tieNote: tieNoteFor(clusters, row, index),
    }));
  }, [board, viewerClusterCode]);

  const topIndividuals = useMemo<IndividualStandingView[]>(
    () => board?.topIndividuals ?? [],
    [board],
  );

  const hasAnyPoints = rows.some((row) => row.totalPoints > 0);

  return {
    rows,
    topIndividuals,
    hasAnyPoints,
    updatedAtLabel: board ? formatTime(board.generatedAt) : '',
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}

export function useMatchFeed() {
  const state = useLocalCachedData({
    name: 'matches.feed',
    loader: useCallback(() => fetchMatchFeed(), []),
    ttlMs: POLL_MIN_MS,
  });
  usePolling(state.reload);
  const live = useLiveBoard();
  const matches = useMemo(
    () => mergeMatchFeed(state.data?.items ?? [], live.matches),
    [state.data, live.matches],
  );
  return {
    matches,
    /** ADR-321 — in dumb mode the feed is award lines, not matches. */
    mode: state.data?.mode ?? 'matches',
    awards: state.data?.awards ?? [],
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}

/**
 * ADR-089/141 — the line-up listing itself: what is on court, what finished, what is next.
 *
 * Split out from `useLineups` for the hall screen (ADR-141), which renders the same three
 * lists and has no "my team" at all. The split is not cosmetic: the missing half calls
 * `GET /api/teams/me`, which a screen key is deliberately not allowed to reach (ADR-140), so
 * a screen using the whole hook would 401 on every poll and show nothing.
 */
/**
 * ADR-150 — the hall screen's bracket read.
 *
 * Polled on the same cadence as everything else on that surface, and cached locally for the
 * same reason the other board reads are: a projector that reloads mid-afternoon should come
 * back with the picture it had, not a blank frame while the first poll lands.
 */
export function useBracketBoard() {
  const state = useLocalCachedData({
    name: 'tournament.bracket',
    loader: useCallback(() => fetchBracket(), []),
    ttlMs: POLL_MIN_MS,
  });
  usePolling(state.reload);
  return {
    bracket: state.data?.bracket ?? null,
    isLoading: state.isLoading,
    error: state.error,
  };
}

export function useLineupBoard() {
  const state = useLocalCachedData({
    name: 'tournament.lineups',
    loader: useCallback(() => fetchLineups(), []),
    ttlMs: POLL_MIN_MS,
  });
  usePolling(state.reload);
  return {
    tournament: state.data?.tournament ?? null,
    items: state.data?.items ?? [],
    mode: state.data?.mode ?? 'matches',
    viewerUpSoon: state.data?.viewerUpSoon ?? null,
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}

/**
 * ADR-089 — the Line-ups tab. The listing above, plus the viewer's own team id so the page
 * can point at THEIR rows: "when are we up?" should take one glance.
 */
export function useLineups() {
  const board = useLineupBoard();
  const myTeamState = useLocalCachedData({
    name: MY_TEAM_CACHE,
    loader: useCallback(() => fetchMyTeam(), []),
    ttlMs: MY_TEAM_TTL_MS,
  });
  return {
    ...board,
    myTeamId: myTeamState.data?.team?.id ?? null,
  };
}

/**
 * ADR-177 — the day's programme.
 *
 * Cached locally like the other board reads, so a phone opened in a dead spot by the water
 * still shows the run sheet it loaded on the bus. That is most of the value of this tab: the
 * moment somebody needs to know where to be is the moment they have wandered out of signal.
 *
 * `nowId` and `nextId` arrive derived from the SERVER's clock and are used as sent. Re-deriving
 * them here from `Date.now()` was the obvious alternative and is worse — three hundred phones
 * with three hundred slightly wrong clocks would disagree about what is happening, and the one
 * screen whose entire job is to make a crowd agree would be the screen that made it argue.
 */
export function useAgenda() {
  const state = useLocalCachedData({
    name: 'day.agenda',
    loader: useCallback(() => fetchAgenda(), []),
    ttlMs: POLL_MIN_MS,
  });
  usePolling(state.reload);
  return {
    items: state.data?.items ?? [],
    nowId: state.data?.nowId ?? null,
    nextId: state.data?.nextId ?? null,
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}
