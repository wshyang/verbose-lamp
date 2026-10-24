import { describe, expect, it } from 'vitest';
import type { Award, Match, Slot, SlotSource, TournamentState } from '@psd/tournament/core';
import { bracketView, courtView, fixtureView, matchView, tournamentView, type ViewContext } from '../views/tournament.js';
import {
  adminEntrantViews,
  adminMatchView,
  adminSchedulerView,
  adminStageViews,
  placementChangeView,
  unplacedMatches,
} from '../views/tournamentAdmin.js';
import { assertResultMatchesScore } from '../lib/matchResult.js';
import { HttpError } from '../lib/http.js';
import type { TournamentSchedulerRow } from '../db/schema/index.js';
import { lineupMatches, plannedMs } from '../routes-tournament/support.js';

/**
 * ADR-277 — the compatibility views, field by field: every value the kept participant, facilitator
 * and hall-screen code renders is pinned here, because those surfaces cannot change to meet us.
 */

function slot(source: SlotSource, label: string, seated: string | null = null): Slot {
  return { source, label, seatedEntrantId: seated, seatOverrideReason: null };
}

function match(overrides: Partial<Match> & { id: string }): Match {
  return {
    code: overrides.id,
    stageId: 'pool',
    groupId: 'gA',
    round: 1,
    sequence: 1,
    origin: 'structure',
    isPlacement: false,
    status: 'scheduled',
    courtId: 'c1',
    plannedStartAt: '2026-10-15T02:00:00.000Z',
    plannedMinutes: 12,
    startedAt: null,
    endedAt: null,
    startedBy: null,
    scoreA: 0,
    scoreB: 0,
    result: null,
    isVoided: false,
    cancelReason: null,
    version: 0,
    slots: { a: slot({ kind: 'entrant', entrantId: 'e1' }, 'Reds'), b: slot({ kind: 'entrant', entrantId: 'e2' }, 'Blues') },
    ...overrides,
  };
}

const played = match({
  id: 'm1',
  sequence: 1,
  status: 'completed',
  startedAt: '2026-10-15T02:00:00.000Z',
  endedAt: '2026-10-15T02:12:00.000Z',
  startedBy: { kind: 'facilitator', id: 'fa-1', label: 'court1' },
  scoreA: 3,
  scoreB: 1,
  result: { kind: 'score', winnerSide: 'a' },
  slots: { a: slot({ kind: 'entrant', entrantId: 'e1' }, 'Reds', 'e1'), b: slot({ kind: 'entrant', entrantId: 'e2' }, 'Blues', 'e2') },
});

const final = match({
  id: 'f',
  stageId: 'ko',
  groupId: null,
  sequence: 2,
  slots: { a: slot({ kind: 'winner_of', matchId: 'm1' }, 'Winner of m1'), b: slot({ kind: 'group_place', groupId: 'gA', place: 2 }, '2nd in Group A') },
});

const third = match({ id: 't', stageId: 'ko', groupId: null, sequence: 3, isPlacement: true });

function award(id: string, input: { entrantId: string; points: number }): Award {
  return { id, entrantId: input.entrantId, matchId: 'm1', kind: 'result', points: input.points, reason: 'x', createdAt: 't', voidedAt: null };
}

function context(): ViewContext {
  const state: TournamentState = {
    tournament: { id: 't1', name: 'Day', status: 'live', kind: 'captains_ball' as const, rates: { win: 30, draw: 20, loss: 10 }, closeReason: null, pausedAt: null },
    entrants: [
      { id: 'e1', name: 'Reds', entryOrder: 1, withdrawnAt: null },
      { id: 'e2', name: 'Blues', entryOrder: 2, withdrawnAt: null },
    ],
    stages: [
      { id: 'pool', ordinal: 1, label: 'Pool', kind: 'pool', allowsDraws: true, advanceCount: 1, rates: null, tablePoints: null, intake: null, roster: [], status: 'active' },
      { id: 'ko', ordinal: 2, label: 'Final', kind: 'bracket', allowsDraws: false, advanceCount: 0, rates: null, tablePoints: null, intake: null, roster: [], status: 'pending' },
    ],
    groups: [{ id: 'gA', stageId: 'pool', code: 'A', label: 'Group A', entrantIds: ['e1', 'e2'] }],
    matches: [played, final, third],
    awards: [award('a1', { entrantId: 'e1', points: 30 }), award('a2', { entrantId: 'e2', points: 10 })],
    courts: [{ id: 'c1', label: 'Court 1', isEnabled: true }],
  };
  return {
    state,
    teamOf: new Map([
      ['e1', 'team-1'],
      ['e2', 'team-2'],
    ]),
    courtLabels: new Map([['c1', 'Court 1']]),
    formatId: 'groups_knockout',
  };
}

describe('matchView — the feed and the court console', () => {
  it('names teams, court, winner, scores and the points the match actually paid', () => {
    expect(matchView(context(), played)).toMatchObject({
      id: 'm1',
      courtLabel: 'Court 1',
      teamAId: 'team-1',
      teamAName: 'Reds',
      teamBName: 'Blues',
      status: 'completed',
      scoreA: 3,
      winnerTeamId: 'team-1',
      winnerTeamName: 'Reds',
      startedByUsername: 'court1',
      completedAt: '2026-10-15T02:12:00.000Z',
      winPointsSnapshot: 30,
      lossPointsSnapshot: 10,
      drawPointsSnapshot: null,
      stage: 'group',
      isVoided: false,
    });
  });

  it('calls a bracket match knockout and a placement match third place', () => {
    expect(matchView(context(), final).stage).toBe('knockout');
    expect(matchView(context(), third).stage).toBe('third_place');
  });

  it('reports a draw at the draw rate', () => {
    const drawn = { ...played, scoreB: 3, result: { kind: 'score' as const, winnerSide: null } };
    expect(matchView(context(), drawn)).toMatchObject({ winnerTeamId: null, drawPointsSnapshot: 30, winPointsSnapshot: null });
  });
});

describe('fixtureView — the line-ups', () => {
  it('resolves a decided feeder to a team, and labels an undecided place', () => {
    // A second group match still to play keeps the group undecided, so its places are forecasts.
    const open = context();
    const pending = match({ id: 'm2', sequence: 4 });
    const undecided = { ...open, state: { ...open.state, matches: [...open.state.matches, pending] } };
    const row = fixtureView(undecided, final);
    expect(row).toMatchObject({ status: 'pending', teamAId: 'team-1', teamAName: 'Reds', teamAFromSequence: 1, suggestedCourtLabel: 'Court 1' });
    expect(row.teamBId).toBeNull();
    expect(row.teamBName).toBe('2nd in Group A');
    expect(row.estimatedStartAt).toBe('2026-10-15T02:00:00.000Z');
  });

  it('leaves an undecided feeder seat unnamed, for the client to name from its sequence', () => {
    const undecided = context();
    const unplayed = { ...undecided, state: { ...undecided.state, matches: [{ ...played, status: 'scheduled' as const, result: null }, final] } };
    const row = fixtureView(unplayed, final);
    expect(row.teamAName).toBeNull();
    expect(row.teamAFromSequence).toBe(1);
  });

  it('maps every status the line-ups and the hall screen branch on', () => {
    expect(fixtureView(context(), played).status).toBe('played');
    expect(fixtureView(context(), { ...played, status: 'in_progress', result: null }).status).toBe('claimed');
    expect(fixtureView(context(), { ...final, status: 'cancelled' }).status).toBe('skipped');
    expect(fixtureView(context(), { ...played, result: { kind: 'walkover', winnerSide: 'b' } }).status).toBe('walkover');
  });
});

describe('tournamentView, courtView and bracketView', () => {
  it('summarises the day in the shape the line-ups read', () => {
    expect(tournamentView(context(), 'start')).toMatchObject({
      format: 'world_cup',
      status: 'group_stage',
      groupSize: 2,
      advanceCount: 1,
      hasThirdPlace: true,
      activatedAt: 'start',
    });
    const closed = context();
    const done = { ...closed, state: { ...closed.state, tournament: { ...closed.state.tournament, status: 'closed' as const } }, formatId: 'round_robin' };
    expect(tournamentView(done, 'start')).toMatchObject({ format: 'round_robin', status: 'completed' });
  });

  it('marks a court busy only while a match is live on it', () => {
    const court = { id: 'c1', courtNumber: 1, label: 'Court 1', isEnabled: true };
    expect(courtView(context(), court).currentMatchId).toBeNull();
    const live = context();
    const busy = { ...live, state: { ...live.state, matches: [{ ...final, status: 'in_progress' as const }] } };
    expect(courtView(busy, court).currentMatchId).toBe('f');
  });

  it('resolves a decided group place to its team', () => {
    expect(fixtureView(context(), final)).toMatchObject({ teamBId: 'team-2', teamBName: 'Blues' });
  });

  it('draws groups with ranks and the road to the final', () => {
    const view = bracketView(context());
    expect(view.groups[0]?.slots.map((row) => [row.label, row.rank])).toEqual([
      ['Reds', 1],
      ['Blues', 2],
    ]);
    expect(view.rounds.map((round) => round.label)).toEqual(['Final']);
    expect(view.rounds[0]?.matches[0]?.a).toMatchObject({ label: 'Reds', teamId: 'team-1' });
  });
});

describe('the views at their edges — unseated, unplaced, unknown', () => {
  it('names an unseated, unknown team by its slot label and leaves the court blank off-court', () => {
    const open = context();
    const ghost = match({ id: 'g', courtId: null, plannedStartAt: null, slots: { a: slot({ kind: 'vacant' }, 'Bye'), b: slot({ kind: 'entrant', entrantId: 'e9' }, 'Somebody') } });
    const view = matchView(open, ghost);
    expect(view).toMatchObject({ courtId: '', courtLabel: '', teamAId: '', teamAName: 'Bye', teamBName: 'Somebody', startedAt: new Date(0).toISOString() });
    expect(fixtureView(open, ghost)).toMatchObject({ suggestedCourtLabel: null, teamBId: null });
    const missingStage = matchView(open, { ...ghost, stageId: 'gone' });
    expect(missingStage.stage).toBe('group');
  });

  it('reads the status of a day with no stage left, and labels deep bracket rounds', () => {
    const done = context();
    const finished = { ...done, state: { ...done.state, stages: done.state.stages.map((stage) => ({ ...stage, status: 'completed' as const })) } };
    expect(tournamentView(finished, 's').status).toBe('completed');
    const deep = context();
    const ko = (id: string, round: number) => match({ id, stageId: 'ko', groupId: null, round, sequence: round * 10 });
    const rounds = { ...deep, state: { ...deep.state, matches: [ko('r1', 1), ko('r2', 2), ko('r3', 3), ko('r4', 4)] } };
    expect(bracketView(rounds).rounds.map((round) => round.label)).toEqual(['Round 1', 'Quarter-finals', 'Semi-finals', 'Final']);
  });

  it('shapes the desk views: seats, pins, standings, entrants, scheduler, changes, the unplaced', () => {
    const open = context();
    const pinned = new Set(['f']);
    const view = adminMatchView(open, { match: final, pinned });
    expect(view).toMatchObject({ isPinned: true, stageLabel: 'Final', courtLabel: 'Court 1', a: { teamId: 'team-1', isSeated: false } });
    // ADR-329 F3 — a seat frozen on the losing team reads as a conflict for the desk to reseat;
    // an unseated seat is not a conflict, just a place still to fill.
    const frozen = { ...final, slots: { ...final.slots, a: { ...final.slots.a, seatedEntrantId: 'e2' } } };
    const frozenContext = { ...open, state: { ...open.state, matches: open.state.matches.map((row) => (row.id === 'f' ? frozen : row)) } };
    expect(adminMatchView(frozenContext, { match: frozen, pinned: new Set() }).seatConflict).toEqual({
      side: 'a',
      seatedTeamId: 'team-2',
      seatedTeamName: 'Blues',
      wouldBeTeamId: 'team-1',
      wouldBeTeamName: 'Reds',
    });
    expect(view.seatConflict).toBeNull();
    expect(adminMatchView(open, { match: { ...final, stageId: 'gone', courtId: null }, pinned: new Set() })).toMatchObject({ stageLabel: '', courtLabel: null, isPinned: false });
    const stages = adminStageViews(open);
    expect(stages[0]?.groups[0]?.standings.map((row) => row.teamId)).toEqual(['team-1', 'team-2']);
    // ADR-320 — the desk reads the stage's internal table points (default 3/1/0, never
    // the paid rates) and the reconciled handover: this group's one qualifier.
    expect(stages[0]?.tablePoints).toEqual({ win: 3, draw: 1, loss: 0 });
    expect(stages[0]?.advancers).toEqual([{ teamId: 'team-1', name: 'Reds', place: 1, via: 'qualifier' }]);
    expect(stages[1]?.advancers).toEqual([]);
    expect(adminEntrantViews(open).map((row) => [row.teamId, row.awardedPoints])).toEqual([
      ['team-1', 30],
      ['team-2', 10],
    ]);
    const stranger = { ...open, teamOf: new Map<string, string>() };
    expect(adminEntrantViews(stranger)[0]?.teamId).toBe('');
    expect(adminStageViews(stranger)[0]?.standings[0]?.teamId).toBeNull();
    const change = placementChangeView(open, { matchId: 'f', kind: 'moved', from: { courtId: 'c1', start: 0 }, to: { courtId: 'gone', start: 60 } });
    expect(change).toMatchObject({ code: 'f', from: { courtLabel: 'Court 1' }, to: { courtLabel: '', startAt: new Date(3_600_000).toISOString() } });
    expect(placementChangeView(open, { matchId: 'nope', kind: 'added', from: null, to: null }).code).toBe('');
    expect(unplacedMatches({ ...open.state, matches: [{ ...final, courtId: null }, played] }).map((row) => row.id)).toEqual(['f']);
  });

  it('tells the desk which stage feeds a stage, so an undealt group can say what it is waiting for (ADR-325)', () => {
    const open = context();
    // The Final is fed by the pool: four teams from "Pool", whatever the pool is called today.
    const fed = {
      ...open,
      state: {
        ...open.state,
        stages: open.state.stages.map((stage) => (stage.id === 'ko' ? { ...stage, intake: { fromStageId: 'pool', count: 4 } } : stage)),
      },
    };
    const stages = adminStageViews(fed);
    expect(stages[0]?.intake).toBeNull();
    expect(stages[1]?.intake).toEqual({ fromLabel: 'Pool', count: 4 });
    // A feeder that no longer exists is said plainly rather than crashing the console.
    const orphan = { ...fed, state: { ...fed.state, stages: fed.state.stages.filter((stage) => stage.id !== 'pool') } };
    expect(adminStageViews(orphan)[0]?.intake).toEqual({ fromLabel: 'the previous stage', count: 4 });
  });

  it('marks a stage started from its matches, counts its fed roster, and recovers its plan code (ADR-334)', () => {
    const stages = adminStageViews(context());
    // "Started" is measured on matches, not the stage's own status: the pool has a finished
    // match, the final has none under way.
    expect(stages.map((stage) => [stage.hasStarted, stage.rosterCount])).toEqual([
      [true, 0],
      [false, 0],
    ]);
    const open = context();
    const fed = {
      ...open,
      state: {
        ...open.state,
        stages: open.state.stages.map((stage) => (stage.id === 'ko' ? { ...stage, roster: ['e1', 'e2'] } : stage)),
        matches: open.state.matches.map((match) => (match.stageId === 'pool' ? { ...match, code: 'GRP-A-1' } : match)),
      },
    };
    const fedStages = adminStageViews(fed);
    expect(fedStages[1]?.rosterCount).toBe(2);
    expect(fedStages[0]?.code).toBe('GRP');
  });

  it('reads the scheduler row with and without its optional instants', () => {
    const row = {
      tournamentId: 't1',
      format: 'swiss',
      options: {},
      status: 'active',
      matchMinutes: 12,
      changeoverMinutes: 3,
      restMinutes: 0,
      deadlineAt: null,
      autoAdvance: true,
      plannedAt: null,
      terminatedAt: null,
      terminatedByLabel: null,
      terminateReason: null,
      pipelineSpec: null,
      revision: 0,
    } satisfies TournamentSchedulerRow;
    expect(adminSchedulerView(row)).toMatchObject({ deadlineAt: null, plannedAt: null, terminatedAt: null });
    const at = new Date('2026-10-15T09:00:00.000Z');
    expect(adminSchedulerView({ ...row, deadlineAt: at, plannedAt: at, terminatedAt: at })).toMatchObject({ deadlineAt: at.toISOString(), plannedAt: at.toISOString(), terminatedAt: at.toISOString() });
  });
});

describe('assertResultMatchesScore — the one rule for both doors (ADR-157, kept)', () => {
  const message = (fn: () => void) => {
    try {
      fn();
      return null;
    } catch (error) {
      return error instanceof HttpError ? error.message : String(error);
    }
  };
  const level = { scoreA: 2, scoreB: 2, teamAId: 'A', teamBId: 'B' };
  const ahead = { scoreA: 3, scoreB: 1, teamAId: 'A', teamBId: 'B' };

  it('accepts a declared draw only on a level score where draws are legal', () => {
    expect(message(() => assertResultMatchesScore(level, null, { stage: 'group' }))).toBeNull();
    expect(message(() => assertResultMatchesScore(ahead, null, { stage: 'group' }))).toMatch(/not level/);
    expect(message(() => assertResultMatchesScore(level, null, { stage: 'knockout' }))).toMatch(/cannot be drawn/);
  });

  it('names a winner only when the score agrees, with the knockout 0 - 0 escape hatch', () => {
    expect(message(() => assertResultMatchesScore(ahead, 'A', { stage: 'knockout' }))).toBeNull();
    expect(message(() => assertResultMatchesScore(ahead, 'B', { stage: 'knockout' }))).toMatch(/higher score/);
    expect(message(() => assertResultMatchesScore({ ...ahead, scoreA: 0, scoreB: 2 }, 'B', { stage: 'group' }))).toBeNull();
    expect(message(() => assertResultMatchesScore(level, 'A', { stage: 'group' }))).toMatch(/is a draw/);
    expect(message(() => assertResultMatchesScore(level, 'A', { stage: 'knockout' }))).toMatch(/play on/);
    expect(message(() => assertResultMatchesScore({ ...level, scoreA: 0, scoreB: 0 }, 'B', { stage: 'knockout' }))).toBeNull();
  });

  it('settles a level knockout by tiebreak, and refuses a tiebreak the score does not need (ADR-329 F5)', () => {
    expect(message(() => assertResultMatchesScore(level, 'B', { stage: 'knockout', tiebreakMethod: 'coin_toss' }))).toBeNull();
    expect(message(() => assertResultMatchesScore(level, 'A', { stage: 'third_place', tiebreakMethod: 'rock_paper_scissors' }))).toBeNull();
    expect(message(() => assertResultMatchesScore(level, 'C', { stage: 'knockout', tiebreakMethod: 'coin_toss' }))).toMatch(/higher score/);
    expect(message(() => assertResultMatchesScore(ahead, 'A', { stage: 'knockout', tiebreakMethod: 'coin_toss' }))).toMatch(/no tiebreak is needed/);
    expect(message(() => assertResultMatchesScore(level, 'A', { stage: 'group', tiebreakMethod: 'coin_toss' }))).toMatch(/no tiebreak is needed/);
    expect(message(() => assertResultMatchesScore(level, 'A', { stage: 'knockout' }))).toMatch(/play on/);
  });
});

describe('play order — an unplaced match goes last, not first', () => {
  it('sorts by planned instant numerically, live first, then the structure order', () => {
    const open = context();
    const placed = match({ id: 'placed', sequence: 5, plannedStartAt: '2026-10-15T02:00:00.000Z' });
    const unplaced = match({ id: 'unplaced', sequence: 1, plannedStartAt: null, courtId: null });
    const live = match({ id: 'live', sequence: 9, status: 'in_progress' });
    const tie = match({ id: 'tie', sequence: 2, plannedStartAt: '2026-10-15T02:00:00.000Z' });
    const order = lineupMatches({ ...open.state, matches: [unplaced, placed, live, tie] }).map((row) => row.id);
    expect(order).toEqual(['live', 'tie', 'placed', 'unplaced']);
    expect(plannedMs(null)).toBe(Number.POSITIVE_INFINITY);
  });
});
