import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { adminMatch, adminTournament, consoleView } from '../../test-utils/tournamentFixtures.js';
import { closeTournament, discardDraft } from '../api/tournament.js';
import { groupMatches, phaseOf, useTournamentDesk } from './useTournamentDesk.js';
import { deadlineOf, formatProblem, INITIAL_SETUP, optionsOf, useTournamentSetup } from './useTournamentSetup.js';
import { titleOf, useTournamentActs, type DeskAct } from './useTournamentActs.js';

const act_ = (fn: () => void) => act(fn);
const actAsync = (fn: () => Promise<unknown>) => act(async () => void (await fn()));

/**
 * ADR-279 — the Control subtab's hooks: the one read and the desk writes (the API's answer replaces
 * what the hook holds), and the setup form's rules (the engine's own format validation).
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

describe('groupMatches and phaseOf', () => {
  it('splits live, queued (by plan) and finished (latest first), and leaves byes off the list', () => {
    const matches = [
      adminMatch({ id: 'q2', plannedStartAt: '2026-10-15T03:00:00.000Z', sequence: 2 }),
      adminMatch({ id: 'q1', plannedStartAt: '2026-10-15T02:00:00.000Z', sequence: 1 }),
      adminMatch({ id: 'q3', plannedStartAt: null, sequence: 3 }),
      adminMatch({ id: 'live', status: 'in_progress' }),
      adminMatch({ id: 'old', status: 'completed', endedAt: '2026-10-15T02:10:00.000Z' }),
      adminMatch({ id: 'new', status: 'cancelled', endedAt: '2026-10-15T02:30:00.000Z' }),
      adminMatch({ id: 'bye', status: 'completed', resultKind: 'bye', endedAt: '2026-10-15T02:40:00.000Z' }),
    ];
    const groups = groupMatches(adminTournament({ matches }));
    expect(groups.live.map((row) => row.id)).toEqual(['live']);
    expect(groups.queued.map((row) => row.id)).toEqual(['q1', 'q2', 'q3']);
    expect(groups.finished.map((row) => row.id)).toEqual(['new', 'old']);
    expect(groupMatches(null)).toEqual({ live: [], queued: [], finished: [] });
  });

  it('reads the phase off the tournament', () => {
    expect(phaseOf(null)).toBe('none');
    expect(phaseOf(adminTournament({ status: 'draft' }))).toBe('draft');
    expect(phaseOf(adminTournament({ status: 'closed' }))).toBe('closed');
  });
});

describe('useTournamentDesk', () => {
  it('loads the console, replaces it with a write’s answer, and reports a refusal in one slot', async () => {
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(null) },
      'POST /api/admin/tournament/close': { body: consoleView(adminTournament({ name: 'After the write' })) },
      'POST /api/admin/tournament/discard': { status: 409, body: { error: { message: 'This tournament has already started.' } } },
    });
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.phase).toBe('none');
    expect(result.current.teams.map((team) => team.name)).toEqual(['Reds', 'Blues']);
    let ok = false;
    await act(async () => {
      ok = await result.current.perform(() => closeTournament(null));
    });
    expect(ok).toBe(true);
    expect(result.current.tournament?.name).toBe('After the write');
    await act(async () => {
      ok = await result.current.perform(() => discardDraft());
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('This tournament has already started.');
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});

describe('the setup form', () => {
  it('sends only the options the chosen format reads', () => {
    expect(optionsOf({ ...INITIAL_SETUP, formatId: 'groups_knockout' })).toEqual({ groupSize: 4, advanceCount: 2, hasThirdPlace: true });
    expect(optionsOf({ ...INITIAL_SETUP, formatId: 'swiss', rounds: '3' })).toEqual({ rounds: 3 });
    expect(optionsOf({ ...INITIAL_SETUP, formatId: 'swiss', rounds: '' })).toEqual({});
    expect(optionsOf({ ...INITIAL_SETUP, formatId: 'round_robin' })).toEqual({});
    expect(optionsOf({ ...INITIAL_SETUP, formatId: 'single_elimination', hasThirdPlace: false })).toEqual({ hasThirdPlace: false });
    expect(optionsOf({ ...INITIAL_SETUP, formatId: 'groups_knockout', groupSize: 'x' })).toEqual({ advanceCount: 2, hasThirdPlace: true });
  });

  it('turns a typed time of day into today’s instant, and nothing into no deadline', () => {
    const today = new Date(2026, 9, 15, 9, 0);
    expect(deadlineOf('16:30', today)).toBe(new Date(2026, 9, 15, 16, 30).toISOString());
    expect(deadlineOf('', today)).toBeNull();
    expect(deadlineOf('teatime', today)).toBeNull();
  });

  it('refuses a field the format cannot play, in the engine’s words', () => {
    expect(formatProblem({ ...INITIAL_SETUP, formatId: 'consolation', teamIds: ['a', 'b', 'c'] })).toMatch(/exactly eight/);
    expect(formatProblem({ ...INITIAL_SETUP, formatId: 'round_robin', teamIds: ['a', 'b'] })).toBeNull();
    expect(formatProblem({ ...INITIAL_SETUP, formatId: 'nope' as never })).toBe('Unknown format.');
    expect(formatProblem({ ...INITIAL_SETUP, formatId: 'consolation' }, 8)).toBeNull();
  });

  it('picks teams in seed order, picks them all, and posts the draft, Start and discard', async () => {
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(null) },
      'POST /api/admin/tournament': { body: consoleView(adminTournament({ status: 'draft' })) },
      'POST /api/admin/tournament/activate': { body: consoleView(adminTournament()) },
      'POST /api/admin/tournament/discard': { body: consoleView(null) },
    });
    const { result } = renderHook(() => {
      const desk = useTournamentDesk();
      return { desk, setup: useTournamentSetup({ desk, teams: desk.teams, entrantCount: 2 }) };
    });
    await waitFor(() => expect(result.current.desk.isLoading).toBe(false));
    act(() => result.current.setup.toggleTeam('t2'));
    act(() => result.current.setup.toggleTeam('t1'));
    expect(result.current.setup.draft.teamIds).toEqual(['t2', 't1']);
    act(() => result.current.setup.toggleTeam('t2'));
    expect(result.current.setup.draft.teamIds).toEqual(['t1']);
    act(() => result.current.setup.pickAll());
    expect(result.current.setup.draft.teamIds).toEqual(['t1', 't2']);
    act(() => result.current.setup.update({ name: '  Beach day  ', formatId: 'round_robin', deadline: '17:00' }));
    expect(result.current.setup.startProblem).toBeNull();
    await act(async () => void (await result.current.setup.createDraft()));
    expect(stub.callsTo('POST /api/admin/tournament')[0]?.body).toEqual({
      name: 'Beach day',
      kind: 'captains_ball',
      winPoints: 30,
      drawPoints: 20,
      lossPoints: 10,
      teamIds: ['t1', 't2'],
      setup: { buildMode: 'format', formatId: 'round_robin', options: {}, matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0, deadline: '17:00' },
    });
    await act(async () => void (await result.current.setup.start()));
    const start = stub.callsTo('POST /api/admin/tournament/activate')[0]?.body as { formatId: string; deadlineAt: string | null };
    expect(start.formatId).toBe('round_robin');
    expect(start.deadlineAt).not.toBeNull();
    await act(async () => void (await result.current.setup.discard()));
    expect(stub.callsTo('POST /api/admin/tournament/discard')).toHaveLength(1);
  });

  it('does not save a Start answer the field cannot play, or one whose timing is not readable', async () => {
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(null) },
      'POST /api/admin/tournament': { body: consoleView(adminTournament({ status: 'draft' })) },
    });
    const { result } = renderHook(() => {
      const desk = useTournamentDesk();
      return { desk, setup: useTournamentSetup({ desk, teams: desk.teams, entrantCount: 2 }) };
    });
    await waitFor(() => expect(result.current.desk.isLoading).toBe(false));
    act(() => result.current.setup.pickAll());
    const create = async () => act(async () => void (await result.current.setup.createDraft()));
    const bodies = () => stub.callsTo('POST /api/admin/tournament').map((call) => call.body as { setup?: unknown });
    act(() => result.current.setup.update({ formatId: 'round_robin', matchMinutes: 'soon' }));
    await create();
    act(() => result.current.setup.update({ matchMinutes: '12', deadline: '25:00' }));
    await create();
    act(() => result.current.setup.update({ deadline: '', buildMode: 'pipeline', stages: [] }));
    await create();
    act(() => result.current.setup.update({ buildMode: 'format', formatId: 'groups_knockout' }));
    await create();
    expect(bodies()).toHaveLength(4);
    expect(bodies().every((body) => body.setup === undefined)).toBe(true);
  });
});

describe('useTournamentActs — one reason-gated act at a time', () => {
  it('names every act, and sends each to its own route with the reason', async () => {
    const match = adminMatch({ id: 'm1', status: 'completed', scoreA: 2, scoreB: 1 });
    const acts: DeskAct[] = [
      { kind: 'correct', match },
      { kind: 'walkover', match, winnerSide: 'b' },
      { kind: 'void', match },
      { kind: 'void', match: { ...match, isVoided: true } },
      { kind: 'cancel', match },
      { kind: 'completeStage', stageId: 's1', label: 'Pool' },
      { kind: 'withdraw', teamId: 't1', name: 'Reds' },
      { kind: 'award', teamId: 't1', name: 'Reds' },
      { kind: 'terminate' },
      { kind: 'close' },
    ];
    expect(acts.map(titleOf)).toEqual([
      'Correct M1',
      'Walkover in M1',
      'Void M1',
      'Reinstate M1',
      'Call off M1',
      'Close Pool',
      'Withdraw Reds',
      'Award points to Reds',
      'Stop the scheduler for good',
      'Close the tournament',
    ]);
    const answer = { body: consoleView(adminTournament()) };
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(adminTournament()) },
      'POST /api/admin/tournament/matches/m1/result': answer,
      'POST /api/admin/tournament/matches/m1/walkover': answer,
      'POST /api/admin/tournament/matches/m1/void': answer,
      'POST /api/admin/tournament/matches/m1/cancel': answer,
      'POST /api/admin/tournament/stages/s1/complete': answer,
      'POST /api/admin/tournament/entrants/t1/withdraw': answer,
      'POST /api/admin/tournament/awards': answer,
      'POST /api/admin/tournament/scheduler/terminate': answer,
      'POST /api/admin/tournament/close': answer,
    });
    const { result } = renderHook(() => {
      const desk = useTournamentDesk();
      return useTournamentActs(desk);
    });
    for (const act of acts) {
      act_(() => result.current.open(act));
      if (act.kind === 'award') act_(() => result.current.patchExtras({ points: '5' }));
      act_(() => result.current.setReason(act.kind === 'close' || act.kind === 'completeStage' ? '' : '  because  '));
      await actAsync(() => result.current.confirm());
      expect(result.current.act).toBeNull();
    }
    expect(stub.callsTo('POST /api/admin/tournament/matches/m1/result')[0]?.body).toEqual({ scoreA: 2, scoreB: 1, winnerSide: null, tiebreakMethod: null, reason: 'because' });
    expect(stub.callsTo('POST /api/admin/tournament/matches/m1/void').map((call) => (call.body as { isVoided: boolean }).isVoided)).toEqual([true, false]);
    expect(stub.callsTo('POST /api/admin/tournament/stages/s1/complete')[0]?.body).toEqual({ overrides: [], reason: null });
    expect(stub.callsTo('POST /api/admin/tournament/awards')[0]?.body).toEqual({ teamId: 't1', points: 5, reason: 'because' });
    expect(stub.callsTo('POST /api/admin/tournament/close')[0]?.body).toEqual({ reason: null });
  });

  it('keeps the dialog open on a refusal, closes it on cancel, and does nothing with no act', async () => {
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(adminTournament()) },
      'POST /api/admin/tournament/scheduler/terminate': { status: 400, body: { error: { message: 'The scheduler is already stopped.' } } },
    });
    const { result } = renderHook(() => {
      const desk = useTournamentDesk();
      return { desk, acts: useTournamentActs(desk) };
    });
    await actAsync(() => result.current.acts.confirm());
    act_(() => result.current.acts.open({ kind: 'terminate' }));
    act_(() => result.current.acts.setReason('rain'));
    await actAsync(() => result.current.acts.confirm());
    expect(result.current.acts.act).not.toBeNull();
    expect(result.current.desk.error).toBe('The scheduler is already stopped.');
    act_(() => result.current.acts.cancel());
    expect(result.current.acts.act).toBeNull();
  });
});
