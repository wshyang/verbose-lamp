import type { LeaderboardView, MatchView } from '@psd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyLiveLeaderboard,
  applyLiveMatch,
  liveBoardSnapshot,
  mergeMatchFeed,
  resetLiveBoard,
  subscribeToLiveBoard,
} from './boardLive.js';

/**
 * ADR-132 — the store the socket writes to and the board reads from.
 *
 * `mergeMatchFeed` mirrors `/api/tournament/matches/feed`, so the three rules it has to keep
 * are each asserted by name below: `in_progress` before `completed`, `started_at` descending
 * inside each group, and `cancelled` in neither. If the server's feed composition ever
 * changes, these are the tests that should go red.
 */

function match(overrides: Partial<MatchView> & { id: string }): MatchView {
  return {
    courtId: 'court-1',
    courtLabel: 'Court 1',
    teamAId: 'team-a',
    teamAName: 'Team A',
    teamBId: 'team-b',
    teamBName: 'Team B',
    status: 'in_progress',
    scoreA: 0,
    scoreB: 0,
    winnerTeamId: null,
    winnerTeamName: null,
    startedByFacilitatorId: 'fac-1',
    startedByUsername: 'marshal',
    startedAt: '2026-10-03T10:00:00.000Z',
    completedAt: null,
    winPointsSnapshot: null,
    lossPointsSnapshot: null,
    drawPointsSnapshot: null,
    stage: 'group',
    isVoided: false,
    lastEditedAt: null,
    editReason: null,
    ...overrides,
  };
}

const board = (generatedAt: string): LeaderboardView => ({
  clusters: [],
  topIndividuals: [],
  generatedAt,
});

describe('ADR-132 — mergeMatchFeed mirrors the server feed', () => {
  it('replaces a row in place rather than appending a second copy', () => {
    const polled = [match({ id: 'm1', scoreA: 1 })];
    const merged = mergeMatchFeed(polled, [match({ id: 'm1', scoreA: 2 })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.scoreA).toBe(2);
  });

  it('inserts a match the client has never seen', () => {
    const merged = mergeMatchFeed([match({ id: 'm1' })], [match({ id: 'm2' })]);
    expect(merged.map((item) => item.id).sort()).toEqual(['m1', 'm2']);
  });

  it('puts live matches before completed ones', () => {
    const merged = mergeMatchFeed(
      [
        match({ id: 'm1', status: 'completed', startedAt: '2026-10-03T12:00:00.000Z' }),
        match({ id: 'm2', status: 'in_progress', startedAt: '2026-10-03T09:00:00.000Z' }),
      ],
      [],
    );
    expect(merged.map((item) => item.id)).toEqual(['m2', 'm1']);
  });

  it('orders each group by start time, newest first', () => {
    const merged = mergeMatchFeed(
      [
        match({ id: 'old', startedAt: '2026-10-03T09:00:00.000Z' }),
        match({ id: 'new', startedAt: '2026-10-03T11:00:00.000Z' }),
        match({ id: 'mid', startedAt: '2026-10-03T10:00:00.000Z' }),
      ],
      [],
    );
    expect(merged.map((item) => item.id)).toEqual(['new', 'mid', 'old']);
  });

  /** The server's feed is `in_progress` + `completed`; a cancelled match is in neither query. */
  it('drops a match that was cancelled', () => {
    const merged = mergeMatchFeed(
      [match({ id: 'm1' })],
      [match({ id: 'm1', status: 'cancelled' })],
    );
    expect(merged).toEqual([]);
  });

  it('keeps a voided match, which the server still counts as completed', () => {
    const merged = mergeMatchFeed(
      [match({ id: 'm1', status: 'completed' })],
      [match({ id: 'm1', status: 'completed', isVoided: true })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.isVoided).toBe(true);
  });

  /**
   * Two courts can start in the same millisecond, and `Array.prototype.sort` may hand the
   * comparator either order, so the id tiebreak is asserted from both — a one-sided test would
   * leave whichever branch the engine happened not to take unproven.
   */
  it('breaks a start-time tie by id, whichever order they arrive in', () => {
    expect(mergeMatchFeed([match({ id: 'a' }), match({ id: 'b' })], []).map((m) => m.id)).toEqual([
      'b',
      'a',
    ]);
    expect(mergeMatchFeed([match({ id: 'b' }), match({ id: 'a' })], []).map((m) => m.id)).toEqual([
      'b',
      'a',
    ]);
  });
});

describe('ADR-132 — the live board store', () => {
  beforeEach(() => {
    resetLiveBoard();
  });

  it('keeps the newest value per match id', () => {
    applyLiveMatch(match({ id: 'm1', scoreA: 1 }));
    applyLiveMatch(match({ id: 'm1', scoreA: 2 }));
    applyLiveMatch(match({ id: 'm2' }));
    expect(liveBoardSnapshot().matches).toHaveLength(2);
    expect(liveBoardSnapshot().matches.find((item) => item.id === 'm1')?.scoreA).toBe(2);
  });

  /**
   * The retained frame is the whole reason this is a store and not a callback: a participant
   * who opens the board a second after the push must still see it, not wait for the next poll.
   */
  it('retains the last board for a surface that mounts after the frame', () => {
    applyLiveLeaderboard(board('2026-10-03T10:00:00.000Z'));
    expect(liveBoardSnapshot().leaderboard?.generatedAt).toBe('2026-10-03T10:00:00.000Z');
  });

  it('tells subscribers and stops once they leave', () => {
    const listener = vi.fn();
    const stop = subscribeToLiveBoard(listener);
    applyLiveMatch(match({ id: 'm1' }));
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    applyLiveMatch(match({ id: 'm2' }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  /** `useSyncExternalStore` loops forever if the snapshot is a fresh object each call. */
  it('returns the same snapshot object until something changes', () => {
    const first = liveBoardSnapshot();
    expect(liveBoardSnapshot()).toBe(first);
    applyLiveMatch(match({ id: 'm1' }));
    expect(liveBoardSnapshot()).not.toBe(first);
  });

  it('forgets everything on reset, so one session cannot read the last', () => {
    applyLiveMatch(match({ id: 'm1' }));
    applyLiveLeaderboard(board('2026-10-03T10:00:00.000Z'));
    resetLiveBoard();
    expect(liveBoardSnapshot()).toEqual({ matches: [], leaderboard: null });
  });
});
