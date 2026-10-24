import { describe, expect, it } from 'vitest';
import { dependenciesOf, freezeSlot, isAcyclic, occupantsOf, resolveSource, winningSide } from '../core/seats.js';
import { groupStandings, groupWinnersRanked, rankEntrants, stageStandings, tablePointsOf } from '../core/standings.js';
import type { Group, Match, TournamentState } from '../core/types.js';
import { entrants, match, slotOf, stage, state } from './fixtures.js';

function played(id: string, input: { a: string; b: string; scoreA: number; scoreB: number; groupId?: string }): Match {
  const winnerSide = input.scoreA === input.scoreB ? null : input.scoreA > input.scoreB ? 'a' : 'b';
  return match({
    id,
    groupId: input.groupId ?? null,
    status: 'completed',
    scoreA: input.scoreA,
    scoreB: input.scoreB,
    result: { kind: 'score', winnerSide },
    slots: {
      a: { ...slotOf({ kind: 'entrant', entrantId: input.a }), seatedEntrantId: input.a },
      b: { ...slotOf({ kind: 'entrant', entrantId: input.b }), seatedEntrantId: input.b },
    },
  });
}

function matchOf(value: TournamentState, id: string): Match {
  const found = value.matches.find((row) => row.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

const groupA: Group = { id: 'gA', stageId: 's1', code: 'A', label: 'Group A', entrantIds: ['e1', 'e2', 'e3'] };

describe('standings — one rule, explained (P-10)', () => {
  it('ranks on points, then difference, then scored, then entry order', () => {
    const rows = rankEntrants({
      entrants: entrants(4),
      matches: [
        played('m1', { a: 'e1', b: 'e2', scoreA: 3, scoreB: 1 }),
        played('m2', { a: 'e3', b: 'e4', scoreA: 5, scoreB: 1 }),
        played('m3', { a: 'e2', b: 'e4', scoreA: 2, scoreB: 2 }),
      ],
    });
    expect(rows.map((row) => row.entrantId)).toEqual(['e3', 'e1', 'e2', 'e4']);
    expect(rows[0]?.explanation).toMatch(/^Top on 3 pts/);
    expect(rows[1]?.explanation).toMatch(/behind on score difference/);
    expect(rows[2]?.explanation).toMatch(/behind Reds on points/);
  });

  it('calls an entry-order tie arbitrary, and a scored tie by its name', () => {
    const rows = rankEntrants({ entrants: entrants(2), matches: [] });
    expect(rows[1]?.explanation).toMatch(/entry order, which is arbitrary/);
    const scored = rankEntrants({
      entrants: entrants(4),
      matches: [played('m1', { a: 'e1', b: 'e3', scoreA: 3, scoreB: 2 }), played('m2', { a: 'e2', b: 'e4', scoreA: 2, scoreB: 1 })],
    });
    expect(scored[1]?.explanation).toMatch(/fewer points scored/);
  });

  it('ignores voided and unfinished matches, and counts a walkover as a win with no score', () => {
    const voided = { ...played('m1', { a: 'e1', b: 'e2', scoreA: 3, scoreB: 0 }), isVoided: true };
    const walkover = { ...played('m2', { a: 'e2', b: 'e1', scoreA: 0, scoreB: 0 }), result: { kind: 'walkover' as const, winnerSide: 'a' as const } };
    const rows = rankEntrants({ entrants: entrants(2), matches: [voided, walkover, match({ id: 'm3' })] });
    expect(rows[0]).toMatchObject({ entrantId: 'e2', wins: 1, played: 1, scored: 0, difference: 0 });
  });

  it('builds group, stage and group-winner tables', () => {
    const value = state({
      groups: [groupA, { id: 'gB', stageId: 's1', code: 'B', label: 'Group B', entrantIds: ['e4'] }],
      matches: [
        played('m1', { a: 'e1', b: 'e2', scoreA: 1, scoreB: 0, groupId: 'gA' }),
        played('m2', { a: 'e2', b: 'e3', scoreA: 4, scoreB: 0, groupId: 'gA' }),
        played('m3', { a: 'e1', b: 'e3', scoreA: 0, scoreB: 1, groupId: 'gA' }),
      ],
    });
    expect(groupStandings(value, groupA).map((row) => row.entrantId)).toEqual(['e2', 'e1', 'e3']);
    expect(stageStandings(value, stage()).length).toBe(3);
    expect(groupWinnersRanked(value, stage()).map((row) => row.entrantId)).toEqual(['e2', 'e4']);
  });
});

describe('internal table points — a stage ranks on its own scoring, and is never paid it (ADR-320)', () => {
  const matches = [
    played('m1', { a: 'e1', b: 'e2', scoreA: 1, scoreB: 0, groupId: 'gA' }),
    played('m2', { a: 'e2', b: 'e3', scoreA: 0, scoreB: 0, groupId: 'gA' }),
    played('m3', { a: 'e1', b: 'e3', scoreA: 0, scoreB: 0, groupId: 'gA' }),
    played('m4', { a: 'e2', b: 'e3', scoreA: 1, scoreB: 1, groupId: 'gA' }),
  ];

  it('defaults to 3/1/0: one win outranks two draws', () => {
    const rows = rankEntrants({ entrants: entrants(3), matches });
    // e1: W1 D1 = 4; e3: D3 = 3; e2: D2 L1 = 2.
    expect(rows.map((row) => row.entrantId)).toEqual(['e1', 'e3', 'e2']);
    expect(tablePointsOf(stage())).toEqual({ win: 3, draw: 1, loss: 0 });
  });

  it('a stage that values draws over a single win ranks on its own numbers instead', () => {
    const rows = rankEntrants({ entrants: entrants(3), matches, tablePoints: { win: 1, draw: 1, loss: 0 } });
    // e1: 2; e3: 3; e2: 2, and e2 is behind e1 on difference.
    expect(rows.map((row) => row.entrantId)).toEqual(['e3', 'e1', 'e2']);
    const custom = stage({ tablePoints: { win: 1, draw: 1, loss: 0 } });
    const value = state({ stages: [custom], groups: [groupA], matches });
    expect(groupStandings(value, groupA).map((row) => row.entrantId)).toEqual(['e3', 'e1', 'e2']);
    expect(stageStandings(value, custom)[0]).toMatchObject({ entrantId: 'e3', points: 3 });
    expect(tablePointsOf(custom)).toEqual({ win: 1, draw: 1, loss: 0 });
  });

  it('never touches what a result pays: the award rates stay the tournament’s', () => {
    const value = state({ stages: [stage({ tablePoints: { win: 99, draw: 99, loss: 99 } })], groups: [groupA], matches });
    expect(value.tournament.rates).toEqual({ win: 30, draw: 20, loss: 10 });
    expect(groupStandings(value, groupA)[0]?.points).not.toBe(30);
  });
});

describe('seats — requirement 10: a future match depends on an earlier one', () => {
  const semi = played('sf', { a: 'e1', b: 'e2', scoreA: 2, scoreB: 1 });
  const final = match({
    id: 'f',
    slots: { a: slotOf({ kind: 'winner_of', matchId: 'sf' }), b: slotOf({ kind: 'loser_of', matchId: 'sf' }) },
  });

  it('resolves winner and loser seats once the feeder is decided', () => {
    const value = state({ matches: [semi, final] });
    expect(occupantsOf(value, final)).toEqual({ a: 'e1', b: 'e2' });
    expect(winningSide(semi)).toBe('a');
  });

  it('names nobody while the feeder is unfinished, drawn, voided or missing', () => {
    const open = state({ matches: [match({ id: 'sf' }), final] });
    expect(occupantsOf(open, final)).toEqual({ a: null, b: null });
    const drawn = state({ matches: [played('sf', { a: 'e1', b: 'e2', scoreA: 1, scoreB: 1 }), final] });
    expect(occupantsOf(drawn, final).a).toBeNull();
    const voided = state({ matches: [{ ...semi, isVoided: true }, final] });
    expect(occupantsOf(voided, final).a).toBeNull();
    expect(resolveSource(state(), { kind: 'winner_of', matchId: 'gone' })).toBeNull();
    expect(resolveSource(state(), { kind: 'vacant' })).toBeNull();
    expect(resolveSource(state(), { kind: 'pairing', stageId: 's1', round: 2, pairIndex: 0, side: 'a' })).toBeNull();
  });

  it('keeps a frozen seat frozen, whatever the feeder later says', () => {
    const value = state({ matches: [semi, final] });
    const frozen = freezeSlot(value, final.slots.a);
    expect(frozen.seatedEntrantId).toBe('e1');
    const flipped = state({
      matches: [played('sf', { a: 'e1', b: 'e2', scoreA: 0, scoreB: 3 }), { ...final, slots: { ...final.slots, a: frozen } }],
    });
    expect(occupantsOf(flipped, matchOf(flipped, 'f')).a).toBe('e1');
    expect(freezeSlot(value, slotOf({ kind: 'vacant' })).seatedEntrantId).toBeNull();
  });

  it('resolves group places only when the whole group is in, and stage places likewise', () => {
    const groupFinal = match({
      id: 'x',
      stageId: 's2',
      slots: { a: slotOf({ kind: 'group_place', groupId: 'gA', place: 1 }), b: slotOf({ kind: 'stage_place', stageId: 's1', place: 1 }) },
    });
    const partial = state({
      groups: [groupA],
      matches: [played('m1', { a: 'e1', b: 'e2', scoreA: 1, scoreB: 0, groupId: 'gA' }), match({ id: 'm2', groupId: 'gA' }), groupFinal],
    });
    expect(occupantsOf(partial, groupFinal)).toEqual({ a: null, b: null });
    const done = state({ groups: [groupA], matches: [played('m1', { a: 'e1', b: 'e2', scoreA: 1, scoreB: 0, groupId: 'gA' }), groupFinal] });
    expect(occupantsOf(done, matchOf(done, 'x'))).toEqual({ a: 'e1', b: 'e1' });
    expect(resolveSource(done, { kind: 'group_place', groupId: 'missing', place: 1 })).toBeNull();
    expect(resolveSource(done, { kind: 'stage_place', stageId: 'missing', place: 1 })).toBeNull();
    const swiss = state({ matches: [played('m1', { a: 'e3', b: 'e4', scoreA: 2, scoreB: 0 })] });
    expect(resolveSource(swiss, { kind: 'stage_place', stageId: 's1', place: 1 })).toBe('e3');
  });

  it('reads dependency edges and spots a cycle', () => {
    const value = state({ matches: [semi, final] });
    expect(dependenciesOf(value, final)).toEqual(['sf']);
    expect(isAcyclic(value)).toBe(true);
    const loopA = match({ id: 'p', slots: { a: slotOf({ kind: 'winner_of', matchId: 'q' }), b: slotOf({ kind: 'vacant' }) } });
    const loopB = match({ id: 'q', slots: { a: slotOf({ kind: 'winner_of', matchId: 'p' }), b: slotOf({ kind: 'vacant' }) } });
    expect(isAcyclic(state({ matches: [loopA, loopB] }))).toBe(false);
    const grouped = match({
      id: 'g',
      stageId: 's2',
      slots: { a: slotOf({ kind: 'group_place', groupId: 'gA', place: 1 }), b: slotOf({ kind: 'stage_place', stageId: 's9', place: 1 }) },
    });
    const inGroup = state({ matches: [{ ...semi, groupId: 'gA' }, grouped] });
    expect(dependenciesOf(inGroup, grouped)).toEqual(['sf']);
  });
});
