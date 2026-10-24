import { describe, expect, it } from 'vitest';
import { awardTotals } from '../core/awards.js';
import { placeMatch, retimeMatches } from '../core/placement.js';
import { appendRound, hasRoundMatch, recordBye } from '../core/rounds.js';
import { stageStandings } from '../core/standings.js';
import { pairWithoutRematch, planNextSwissRound } from '../scheduler/formats/swiss.js';
import { DESK, MARSHAL, SYSTEM, context, entrants, match, matchIn, ok, refusalCode, stage, state } from './fixtures.js';

const swiss = stage({ id: 'sw', kind: 'swiss', allowsDraws: false, advanceCount: 0 });

function seated(entrantId: string) {
  return { source: { kind: 'entrant' as const, entrantId }, label: entrantId, seatedEntrantId: entrantId, seatOverrideReason: null };
}

function won(id: string, input: { a: string; b: string; round: number }) {
  return match({
    id,
    stageId: 'sw',
    round: input.round,
    status: 'completed',
    scoreA: 2,
    scoreB: 0,
    result: { kind: 'score', winnerSide: 'a' },
    slots: { a: seated(input.a), b: seated(input.b) },
  });
}

/** Five teams after round one: e1 and e3 won, e5 sat out. */
function afterRoundOne() {
  return state({
    entrants: entrants(5),
    stages: [swiss],
    matches: [won('r1a', { a: 'e1', b: 'e2', round: 1 }), won('r1b', { a: 'e3', b: 'e4', round: 1 })],
  });
}

const ids = (count: number) => Array.from({ length: count }, (_, index) => `n${index + 1}`);

describe('recordBye — the Swiss sit-out is a win without a match', () => {
  it('credits a completed one-seat match, pays the win rate, and counts in the table', () => {
    const result = ok(recordBye(afterRoundOne(), { stageId: 'sw', round: 1, entrantId: 'e5' }, context(SYSTEM, ids(2))));
    const bye = matchIn(result.state, 'n1');
    expect(bye).toMatchObject({ status: 'completed', round: 1, courtId: null, result: { kind: 'bye', winnerSide: 'a' } });
    expect(bye.slots.a.seatedEntrantId).toBe('e5');
    expect(bye.slots.b.source.kind).toBe('vacant');
    expect(awardTotals(result.state).get('e5')).toBe(30);
    const row = stageStandings(result.state, swiss).find((entry) => entry.entrantId === 'e5');
    expect(row).toMatchObject({ wins: 1, scored: 0, conceded: 0 });
    expect(result.events.map((event) => event.kind)).toEqual(['bye_recorded']);
  });

  it('refuses a team that already plays in the round, a withdrawn team, staff, and a stage not being played', () => {
    const value = afterRoundOne();
    expect(refusalCode(recordBye(value, { stageId: 'sw', round: 1, entrantId: 'e1' }, context(DESK)))).toBe('entrant_busy');
    const gone = { ...value, entrants: value.entrants.map((row) => (row.id === 'e5' ? { ...row, withdrawnAt: 't' } : row)) };
    expect(refusalCode(recordBye(gone, { stageId: 'sw', round: 1, entrantId: 'e5' }, context(DESK)))).toBe('entrant_withdrawn');
    expect(refusalCode(recordBye(value, { stageId: 'sw', round: 1, entrantId: 'e5' }, context(MARSHAL)))).toBe('not_allowed');
    expect(refusalCode(recordBye(value, { stageId: 'nope', round: 1, entrantId: 'e5' }, context(DESK)))).toBe('wrong_status');
    const pool = { ...value, stages: [stage({ id: 'sw' })] };
    expect(refusalCode(recordBye(pool, { stageId: 'sw', round: 1, entrantId: 'e5' }, context(DESK)))).toBe('wrong_status');
  });

  it('knows who already has a place in a round', () => {
    expect(hasRoundMatch(afterRoundOne(), { stageId: 'sw', round: 1, entrantId: 'e4' })).toBe(true);
    expect(hasRoundMatch(afterRoundOne(), { stageId: 'sw', round: 1, entrantId: 'e5' })).toBe(false);
    expect(hasRoundMatch(afterRoundOne(), { stageId: 'sw', round: 2, entrantId: 'e1' })).toBe(false);
  });
});

describe('appendRound — the next Swiss round, paired by the scheduler', () => {
  it('writes the planned pairs and the bye in one decision, and the bye goes round the field', () => {
    const withBye = ok(recordBye(afterRoundOne(), { stageId: 'sw', round: 1, entrantId: 'e5' }, context(SYSTEM, ['b1', 'b2'])));
    const next = planNextSwissRound(withBye.state, { stage: swiss, rounds: 3 });
    expect(next?.round).toBe(2);
    expect(next?.byeEntrantId).not.toBe('e5');
    const round = { stageId: 'sw', round: 2, pairs: next?.pairs ?? [], byeEntrantId: next?.byeEntrantId ?? null, plannedMinutes: 12 };
    const result = ok(appendRound(withBye.state, round, context(SYSTEM, ids(4))));
    const added = result.state.matches.filter((row) => row.round === 2);
    expect(added.filter((row) => row.status === 'scheduled').map((row) => row.code)).toEqual(['S2-1', 'S2-2']);
    expect(added.filter((row) => row.result?.kind === 'bye')).toHaveLength(1);
    expect(result.events.map((event) => event.kind)).toEqual(['round_paired', 'bye_recorded']);
    expect(planNextSwissRound(result.state, { stage: swiss, rounds: 3 })).toBeNull();
  });

  it('writes no bye for an even field', () => {
    const result = ok(appendRound(afterRoundOne(), { stageId: 'sw', round: 2, pairs: [['e1', 'e3']], byeEntrantId: null, plannedMinutes: 12 }, context(SYSTEM, ids(1))));
    expect(result.events.map((event) => event.kind)).toEqual(['round_paired']);
  });

  it('refuses a round already paired, nobody to pair, a team twice and a withdrawn team', () => {
    const value = afterRoundOne();
    const round = (pairs: [string, string][], extra: { round?: number; bye?: string | null } = {}) => ({
      stageId: 'sw',
      round: extra.round ?? 2,
      pairs,
      byeEntrantId: extra.bye ?? null,
      plannedMinutes: 12,
    });
    expect(refusalCode(appendRound(value, round([['e1', 'e3']], { round: 1 }), context(SYSTEM, ids(2))))).toBe('wrong_status');
    expect(refusalCode(appendRound(value, round([]), context(SYSTEM, ids(2))))).toBe('wrong_status');
    expect(refusalCode(appendRound(value, round([['e1', 'e3']], { bye: 'e1' }), context(SYSTEM, ids(2))))).toBe('same_entrant');
    const gone = { ...value, entrants: value.entrants.map((row) => (row.id === 'e3' ? { ...row, withdrawnAt: 't' } : row)) };
    expect(refusalCode(appendRound(gone, round([['e1', 'e3']]), context(SYSTEM, ids(2))))).toBe('entrant_withdrawn');
  });
});

describe('placeMatch — requirement 9: a person puts a match on a court', () => {
  it('moves a scheduled match and keeps it scheduled', () => {
    const result = ok(placeMatch(state({ matches: [match({ id: 'm1' })] }), { matchId: 'm1', courtId: 'c2', plannedStartAt: '2026-10-15T03:00:00.000Z' }, context(DESK)));
    expect(matchIn(result.state, 'm1')).toMatchObject({ status: 'scheduled', courtId: 'c2', plannedStartAt: '2026-10-15T03:00:00.000Z', version: 1 });
    expect(result.events.map((event) => event.kind)).toEqual(['match_placed']);
  });

  it('refuses staff, an unknown or started match, a disabled court and a closed day', () => {
    const value = state({ matches: [match({ id: 'm1' }), match({ id: 'm2', status: 'in_progress' })] });
    const to = (matchId: string, courtId = 'c1') => ({ matchId, courtId, plannedStartAt: 't' });
    expect(refusalCode(placeMatch(value, to('m1'), context(MARSHAL)))).toBe('not_allowed');
    expect(refusalCode(placeMatch(value, to('nope'), context(DESK)))).toBe('not_found');
    expect(refusalCode(placeMatch(value, to('m2'), context(DESK)))).toBe('wrong_status');
    const off = { ...value, courts: value.courts.map((court) => ({ ...court, isEnabled: false })) };
    expect(refusalCode(placeMatch(off, to('m1'), context(DESK)))).toBe('court_unavailable');
    const closed = { ...value, tournament: { ...value.tournament, status: 'closed' as const } };
    expect(refusalCode(placeMatch(closed, to('m1'), context(DESK)))).toBe('tournament_closed');
  });
});


describe('retimeMatches — ADR-329 F13: a new length reaches only matches not yet started', () => {
  it('retimes scheduled matches under one attributable event, and leaves live and finished ones alone', () => {
    const value = state({
      matches: [
        match({ id: 'm1', plannedMinutes: 20 }),
        match({ id: 'm2', status: 'in_progress', plannedMinutes: 20 }),
        match({ id: 'm3', status: 'completed', plannedMinutes: 20 }),
      ],
    });
    const result = ok(retimeMatches(value, { updates: [{ matchId: 'm1', minutes: 12 }] }, context(DESK)));
    expect(matchIn(result.state, 'm1')).toMatchObject({ plannedMinutes: 12, version: 1 });
    expect(matchIn(result.state, 'm2').plannedMinutes).toBe(20);
    expect(matchIn(result.state, 'm3').plannedMinutes).toBe(20);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ kind: 'matches_retimed', actor: DESK });
    expect(result.events[0]?.detail).toMatchObject({ count: 1 });
  });

  it('refuses lengths outside 1–180, unknown or started matches, and writes nothing on a refusal', () => {
    const value = state({ matches: [match({ id: 'm1' }), match({ id: 'm2', status: 'in_progress' })] });
    expect(refusalCode(retimeMatches(value, { updates: [{ matchId: 'm1', minutes: 0 }] }, context(DESK)))).toBe('bad_step');
    expect(refusalCode(retimeMatches(value, { updates: [{ matchId: 'm1', minutes: 181 }] }, context(DESK)))).toBe('bad_step');
    expect(refusalCode(retimeMatches(value, { updates: [{ matchId: 'm1', minutes: 12.5 }] }, context(DESK)))).toBe('bad_step');
    expect(refusalCode(retimeMatches(value, { updates: [{ matchId: 'nope', minutes: 12 }] }, context(DESK)))).toBe('not_found');
    expect(refusalCode(retimeMatches(value, { updates: [{ matchId: 'm2', minutes: 12 }] }, context(DESK)))).toBe('wrong_status');
    // One bad update refuses the whole batch: no match is retimed.
    const mixed = retimeMatches(value, { updates: [{ matchId: 'm1', minutes: 12 }, { matchId: 'm2', minutes: 12 }] }, context(DESK));
    expect(mixed.ok).toBe(false);
    expect(refusalCode(retimeMatches(value, { updates: [] }, context(DESK)))).toBe('bad_step');
  });
});

describe('pairWithoutRematch — a bounded search (ADR-324)', () => {
  const field = (size: number) => Array.from({ length: size }, (_, index) => `e${index + 1}`);
  const key = (a: string, b: string) => [a, b].sort().join('|');

  it('gives up on a field with no rematch-free pairing instead of enumerating every pairing', () => {
    // The last team has already met all the others, so no pairing can ever succeed, but the search
    // only finds that out at the very bottom of each branch: 19!! = 654,729,075 of them for 20 teams.
    const teams = field(20);
    const last = teams[teams.length - 1] as string;
    const played = new Set(teams.slice(0, -1).map((other) => key(other, last)));
    const started = Date.now();
    expect(pairWithoutRematch(teams, played)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);
  }, 5_000);

  it('still finds a pairing that needs some backtracking', () => {
    const teams = field(6);
    const played = new Set([key('e1', 'e2'), key('e1', 'e3'), key('e3', 'e4'), key('e5', 'e6')]);
    const pairs = pairWithoutRematch(teams, played);
    expect(pairs).not.toBeNull();
    expect(pairs?.flat().sort()).toEqual([...teams].sort());
    for (const [a, b] of pairs ?? []) expect(played.has(key(a, b))).toBe(false);
  });

  it('pairs a large fresh field in one pass', () => {
    expect(pairWithoutRematch(field(64), new Set())).toHaveLength(32);
  });
});
