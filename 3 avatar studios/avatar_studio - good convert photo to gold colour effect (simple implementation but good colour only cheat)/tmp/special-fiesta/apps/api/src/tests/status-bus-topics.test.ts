import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  publishFeedMatch,
  publishLeaderboard,
  publishTeamChatActivity,
  publishTeamChatRetracted,
  publishTeamUpSoon,
  resetStatusBusForTests,
  subscribeToStatus,
  subscribeToTeamStatus,
} from '../lib/statusBus.js';
import type { LeaderboardView, MatchView } from '@psd/contracts';

/**
 * ADR-091 — the status bus has topics, and the topics are the privacy boundary.
 *
 * Written after the SSE mutation audit of 2026-10-05 (`docs/outstanding-tasks.md` §8), which
 * found this property pinned by nothing at all. Widening `subscribeToTeamStatus` to also attach
 * its listener to the global topic — a two-line mistake, and exactly the shape of mistake
 * somebody makes while debugging "why isn't my frame arriving" — put **every team's** chat
 * activity and up-soon calls on **every** connected phone, and all 665 tests still passed.
 *
 * That is the worst outcome in the audit, because it is silent in both directions: nothing
 * fails, and the leak is invisible from the leaking phone's own screen. The only thing a
 * participant would notice is their team's dot lighting for somebody else's conversation, which
 * on a noisy day reads as the dot being flaky rather than as a privacy breach.
 *
 * These assertions are at the bus rather than through a socket deliberately. A stream test
 * proves one connection behaves; the property here is about *addressing*, and addressing is a
 * claim about who does NOT receive a frame — which is cheap to state at the emitter and
 * expensive and flaky to state over HTTP.
 */

const TEAM_A = '11111111-1111-7111-8111-111111111111';
const TEAM_B = '22222222-2222-7222-8222-222222222222';

const BOARD: LeaderboardView = {
  clusters: [],
  topIndividuals: [],
  generatedAt: '2026-10-05T09:00:00.000Z',
};

describe('ADR-091 — a team topic is addressed to that team and nobody else', () => {
  afterEach(() => {
    resetStatusBusForTests();
  });

  it('does not deliver one team\u2019s up-soon call to another team', () => {
    const toA = vi.fn();
    const toB = vi.fn();
    subscribeToTeamStatus(TEAM_A, toA);
    subscribeToTeamStatus(TEAM_B, toB);

    publishTeamUpSoon(TEAM_A, { upSoon: true, gamesAway: 1, fixtureId: 'fixture-a' });

    expect(toA).toHaveBeenCalledTimes(1);
    // The assertion the audit's B1 mutation walked straight through.
    expect(toB).not.toHaveBeenCalled();
  });

  it('does not deliver one team\u2019s chat activity or retraction to another team', () => {
    const toA = vi.fn();
    const toB = vi.fn();
    subscribeToTeamStatus(TEAM_A, toA);
    subscribeToTeamStatus(TEAM_B, toB);

    publishTeamChatActivity(TEAM_A, new Date('2026-10-05T09:00:00.000Z'));
    publishTeamChatRetracted(TEAM_A, new Date('2026-10-05T08:59:00.000Z'));

    expect(toA).toHaveBeenCalledTimes(2);
    expect(toB).not.toHaveBeenCalled();
  });

  /**
   * The other half of the boundary, and the half the mutation actually broke: a team
   * subscriber must not be standing in the global room either. Without this, every
   * leaderboard push — the most frequent frame on the bus — would also be handed to every
   * team listener, which the stream would then try to write as a team frame.
   */
  it('does not deliver a global frame to a team subscriber', () => {
    const toTeam = vi.fn();
    subscribeToTeamStatus(TEAM_A, toTeam);

    publishLeaderboard(BOARD);

    expect(toTeam).not.toHaveBeenCalled();
  });

  it('delivers a feed match on the global topic only', () => {
    const global = vi.fn();
    const team = vi.fn();
    subscribeToStatus(global);
    subscribeToTeamStatus(TEAM_A, team);
    publishFeedMatch({ id: 'match-1' } as MatchView);
    expect(global).toHaveBeenCalledWith({ kind: 'feed.match', match: { id: 'match-1' } });
    expect(team).not.toHaveBeenCalled();
  });

  it('does not deliver a team frame to a global subscriber', () => {
    const toEveryone = vi.fn();
    subscribeToStatus(toEveryone);

    publishTeamUpSoon(TEAM_A, { upSoon: true, gamesAway: 0, fixtureId: 'fixture-a' });
    publishTeamChatActivity(TEAM_A, new Date('2026-10-05T09:00:00.000Z'));

    expect(toEveryone).not.toHaveBeenCalled();
  });

  /** Unsubscribing leaves the topic it joined, and leaves the other subscriber alone on it. */
  it('stops delivering once a team subscriber leaves, without disturbing the rest', () => {
    const leaving = vi.fn();
    const staying = vi.fn();
    const unsubscribe = subscribeToTeamStatus(TEAM_A, leaving);
    subscribeToTeamStatus(TEAM_A, staying);

    unsubscribe();
    publishTeamUpSoon(TEAM_A, { upSoon: false, gamesAway: null, fixtureId: null });

    expect(leaving).not.toHaveBeenCalled();
    expect(staying).toHaveBeenCalledTimes(1);
  });
});
