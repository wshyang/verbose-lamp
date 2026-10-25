import { describe, expect, it } from 'vitest';
import { cancelMatch, completeMatch, readOutcome, scoreStep, stageAdHocMatch, startMatch } from '../core/lifecycle.js';
import { DESK, MARSHAL, OTHER_MARSHAL, context, match, matchIn, ok, refusalCode, stage, state } from './fixtures.js';

function seated(entrantId: string) {
  return { source: { kind: 'entrant' as const, entrantId }, label: entrantId, seatedEntrantId: entrantId, seatOverrideReason: null };
}

function unresolved() {
  return { source: { kind: 'winner_of' as const, matchId: 'm0' }, label: 'Winner of M0', seatedEntrantId: null, seatOverrideReason: null };
}

describe('startMatch — requirement 1: two teams on a court', () => {
  it('puts a scheduled match on an enabled, free court and freezes both seats', () => {
    const before = state({ matches: [match({ id: 'm1' })] });
    const result = ok(startMatch(before, { matchId: 'm1', courtId: 'c1' }, context()));
    const live = matchIn(result.state, 'm1');
    expect(live.status).toBe('in_progress');
    expect(live.courtId).toBe('c1');
    expect(live.startedBy).toEqual(MARSHAL);
    expect(live.slots.a.seatedEntrantId).toBe('e1');
    expect(live.slots.b.seatedEntrantId).toBe('e2');
    expect(result.events.map((event) => event.kind)).toEqual(['match_started']);
  });

  it('refuses a busy court, a disabled court and a team already playing', () => {
    const busy = state({
      matches: [match({ id: 'm0', status: 'in_progress', courtId: 'c1', slots: { a: seated('e3'), b: seated('e4') } }), match({ id: 'm1' })],
    });
    expect(refusalCode(startMatch(busy, { matchId: 'm1', courtId: 'c1' }, context()))).toBe('court_busy');
    const disabled = state({ matches: [match({ id: 'm1' })], courts: [{ id: 'c1', label: 'Court 1', isEnabled: false }] });
    expect(refusalCode(startMatch(disabled, { matchId: 'm1', courtId: 'c1' }, context()))).toBe('court_unavailable');
    const playing = state({
      matches: [match({ id: 'm0', status: 'in_progress', courtId: 'c2', slots: { a: seated('e1'), b: seated('e3') } }), match({ id: 'm1' })],
    });
    expect(refusalCode(startMatch(playing, { matchId: 'm1', courtId: 'c1' }, context()))).toBe('entrant_busy');
  });

  it('refuses a match whose seats are still forecasts, one already started, and an unknown one', () => {
    const waiting = state({ matches: [match({ id: 'm1', slots: { a: unresolved(), b: unresolved() } })] });
    expect(refusalCode(startMatch(waiting, { matchId: 'm1', courtId: 'c1' }, context()))).toBe('seat_unresolved');
    const started = state({ matches: [match({ id: 'm1', status: 'in_progress' })] });
    expect(refusalCode(startMatch(started, { matchId: 'm1', courtId: 'c1' }, context()))).toBe('wrong_status');
    expect(refusalCode(startMatch(state(), { matchId: 'nope', courtId: 'c1' }, context()))).toBe('not_found');
  });

  it('refuses a withdrawn team', () => {
    const before = state({ matches: [match({ id: 'm1' })] });
    const withdrawn = { ...before, entrants: before.entrants.map((row) => (row.id === 'e1' ? { ...row, withdrawnAt: 'x' } : row)) };
    expect(refusalCode(startMatch(withdrawn, { matchId: 'm1', courtId: 'c1' }, context()))).toBe('entrant_withdrawn');
  });

  it('activates a pending stage at its first kick-off, and refuses a completed one', () => {
    const pending = state({ stages: [stage({ status: 'pending' })], matches: [match({ id: 'm1' })] });
    const result = ok(startMatch(pending, { matchId: 'm1', courtId: 'c1' }, context()));
    expect(result.state.stages[0]?.status).toBe('active');
    const over = state({ stages: [stage({ status: 'completed' })], matches: [match({ id: 'm1' })] });
    expect(refusalCode(startMatch(over, { matchId: 'm1', courtId: 'c1' }, context()))).toBe('wrong_status');
  });

  it('refuses everything once the tournament is closed', () => {
    const closed = state({ matches: [match({ id: 'm1' })] });
    const value = { ...closed, tournament: { ...closed.tournament, status: 'closed' as const } };
    expect(refusalCode(startMatch(value, { matchId: 'm1', courtId: 'c1' }, context()))).toBe('tournament_closed');
  });
});

describe('stageAdHocMatch — any two teams, by hand', () => {
  it('creates an ad-hoc match in the active stage and starts it on the court', () => {
    const result = ok(
      stageAdHocMatch(state(), { courtId: 'c1', entrantAId: 'e3', entrantBId: 'e4', plannedMinutes: 12 }, context(MARSHAL, ['x1'])),
    );
    const staged = matchIn(result.state, 'x1');
    expect(staged.origin).toBe('ad_hoc');
    expect(staged.status).toBe('in_progress');
    expect(result.events.map((event) => event.kind)).toEqual(['match_staged', 'match_started']);
  });

  it('refuses the same team twice and a day with no stage left', () => {
    const same = stageAdHocMatch(state(), { courtId: 'c1', entrantAId: 'e3', entrantBId: 'e3', plannedMinutes: 12 }, context());
    expect(refusalCode(same)).toBe('same_entrant');
    const allDone = state({ stages: [stage({ status: 'completed' })] });
    const none = stageAdHocMatch(allDone, { courtId: 'c1', entrantAId: 'e1', entrantBId: 'e2', plannedMinutes: 12 }, context());
    expect(refusalCode(none)).toBe('wrong_status');
  });
});

describe('scoreStep — requirement 2: one rally, one tap', () => {
  const live = () => state({ matches: [match({ id: 'm1', status: 'in_progress', courtId: 'c1', scoreA: 3 })] });

  it('moves a side by one from the score the marshal saw', () => {
    const result = ok(scoreStep(live(), { matchId: 'm1', side: 'a', from: 3, to: 4 }, context()));
    expect(matchIn(result.state, 'm1').scoreA).toBe(4);
    const back = ok(scoreStep(result.state, { matchId: 'm1', side: 'b', from: 0, to: 1 }, context()));
    expect(matchIn(back.state, 'm1').scoreB).toBe(1);
  });

  it('treats a retry already applied as a no-op success, and a stale screen as a refusal', () => {
    const retry = ok(scoreStep(live(), { matchId: 'm1', side: 'a', from: 2, to: 3 }, context()));
    expect(retry.events).toEqual([]);
    expect(refusalCode(scoreStep(live(), { matchId: 'm1', side: 'a', from: 1, to: 2 }, context()))).toBe('stale_score');
    expect(refusalCode(scoreStep(live(), { matchId: 'm1', side: 'a', from: 3, to: 5 }, context()))).toBe('bad_step');
  });

  it('refuses a match that is not live, and an unknown one', () => {
    const idle = state({ matches: [match({ id: 'm1' })] });
    expect(refusalCode(scoreStep(idle, { matchId: 'm1', side: 'b', from: 0, to: 1 }, context()))).toBe('wrong_status');
    expect(refusalCode(scoreStep(idle, { matchId: 'nope', side: 'b', from: 0, to: 1 }, context()))).toBe('not_found');
  });
});

describe('completeMatch — requirement 3: the score is the result', () => {
  it('pays win and loss at the tournament rates to the seated entrants', () => {
    const before = state({ matches: [match({ id: 'm1', status: 'in_progress', scoreA: 5, scoreB: 2, slots: { a: seated('e1'), b: seated('e2') } })] });
    const result = ok(completeMatch(before, { matchId: 'm1', namedWinner: null }, context(MARSHAL, ['w1', 'w2'])));
    expect(matchIn(result.state, 'm1').result).toEqual({ kind: 'score', winnerSide: 'a' });
    expect(result.state.awards.map((award) => [award.entrantId, award.points])).toEqual([
      ['e1', 30],
      ['e2', 10],
    ]);
  });

  it('draws where draws are allowed, and refuses level scores in a bracket', () => {
    const level = (allowsDraws: boolean, score: number) =>
      state({
        stages: [stage({ allowsDraws, kind: allowsDraws ? 'pool' : 'bracket' })],
        matches: [match({ id: 'm1', status: 'in_progress', scoreA: score, scoreB: score, slots: { a: seated('e1'), b: seated('e2') } })],
      });
    const drawn = ok(completeMatch(level(true, 2), { matchId: 'm1', namedWinner: null }, context()));
    expect(drawn.state.awards.map((award) => award.points)).toEqual([20, 20]);
    expect(refusalCode(completeMatch(level(false, 2), { matchId: 'm1', namedWinner: null }, context()))).toBe('play_on');
    expect(refusalCode(completeMatch(level(false, 0), { matchId: 'm1', namedWinner: null }, context()))).toBe('winner_required');
    const named = ok(completeMatch(level(false, 0), { matchId: 'm1', namedWinner: 'b' }, context()));
    expect(matchIn(named.state, 'm1').result?.winnerSide).toBe('b');
  });

  it('settles a level knockout by a named tiebreak, keeping the score as played (ADR-329 F5)', () => {
    const level = (score: number) =>
      state({
        stages: [stage({ allowsDraws: false, kind: 'bracket' })],
        matches: [match({ id: 'm1', status: 'in_progress', scoreA: score, scoreB: score, slots: { a: seated('e1'), b: seated('e2') } })],
      });
    const tossed = ok(
      completeMatch(level(2), { matchId: 'm1', namedWinner: 'b', tiebreakMethod: 'coin_toss' }, context(MARSHAL, ['w1', 'w2'])),
    );
    // The score stays 2 - 2; the toss names the winner, pays the win, and is on the event.
    expect(matchIn(tossed.state, 'm1')).toMatchObject({ scoreA: 2, scoreB: 2, result: { kind: 'score', winnerSide: 'b' } });
    expect(tossed.state.awards.map((award) => [award.entrantId, award.points])).toEqual([
      ['e1', 10],
      ['e2', 30],
    ]);
    expect(tossed.events[0]?.detail).toMatchObject({ winnerSide: 'b', tiebreakMethod: 'coin_toss' });
    // Without a method it still plays on; with a method but nobody named, a person must say who won it.
    expect(refusalCode(completeMatch(level(2), { matchId: 'm1', namedWinner: 'b' }, context()))).toBe('play_on');
    expect(refusalCode(completeMatch(level(2), { matchId: 'm1', namedWinner: null, tiebreakMethod: 'rock_paper_scissors' }, context()))).toBe(
      'winner_required',
    );
    // A decided score needs no toss, and a drawn stage takes no winner by toss either.
    const decided = state({
      stages: [stage({ allowsDraws: false, kind: 'bracket' })],
      matches: [match({ id: 'm1', status: 'in_progress', scoreA: 3, scoreB: 2, slots: { a: seated('e1'), b: seated('e2') } })],
    });
    expect(refusalCode(completeMatch(decided, { matchId: 'm1', namedWinner: 'a', tiebreakMethod: 'coin_toss' }, context()))).toBe(
      'tiebreak_not_needed',
    );
    const pool = state({
      stages: [stage({ allowsDraws: true, kind: 'pool' })],
      matches: [match({ id: 'm1', status: 'in_progress', scoreA: 1, scoreB: 1, slots: { a: seated('e1'), b: seated('e2') } })],
    });
    expect(refusalCode(completeMatch(pool, { matchId: 'm1', namedWinner: 'a', tiebreakMethod: 'coin_toss' }, context()))).toBe(
      'tiebreak_not_needed',
    );
  });

  it('pays at the stage rates when the stage has its own, and writes no zero awards', () => {
    const before = state({
      stages: [stage({ rates: { win: 50, draw: 0, loss: 0 } })],
      matches: [match({ id: 'm1', status: 'in_progress', scoreA: 1, slots: { a: seated('e1'), b: seated('e2') } })],
    });
    const result = ok(completeMatch(before, { matchId: 'm1', namedWinner: null }, context()));
    expect(result.state.awards.map((award) => [award.entrantId, award.points])).toEqual([['e1', 50]]);
  });

  it('refuses a named winner the score disagrees with, and a match that is not live', () => {
    const before = state({ matches: [match({ id: 'm1', status: 'in_progress', scoreA: 5, scoreB: 2 })] });
    expect(refusalCode(completeMatch(before, { matchId: 'm1', namedWinner: 'b' }, context()))).toBe('winner_required');
    const idle = state({ matches: [match({ id: 'm1' })] });
    expect(refusalCode(completeMatch(idle, { matchId: 'm1', namedWinner: null }, context()))).toBe('wrong_status');
    expect(refusalCode(completeMatch(idle, { matchId: 'nope', namedWinner: null }, context()))).toBe('not_found');
  });

  it('reads the four outcome modes exactly as the court console does', () => {
    expect(readOutcome({ scoreA: 1, scoreB: 0, allowsDraws: false })).toEqual({ mode: 'win', winnerSide: 'a' });
    expect(readOutcome({ scoreA: 0, scoreB: 1, allowsDraws: false })).toEqual({ mode: 'win', winnerSide: 'b' });
    expect(readOutcome({ scoreA: 2, scoreB: 2, allowsDraws: true }).mode).toBe('draw');
    expect(readOutcome({ scoreA: 2, scoreB: 2, allowsDraws: false }).mode).toBe('overtime');
    expect(readOutcome({ scoreA: 0, scoreB: 0, allowsDraws: false }).mode).toBe('untracked');
  });
});

describe('cancelMatch — F24', () => {
  const live = () => state({ matches: [match({ id: 'm1', status: 'in_progress', startedBy: MARSHAL })] });

  it('lets the starter cancel without a reason, and nobody else on staff', () => {
    expect(ok(cancelMatch(live(), { matchId: 'm1', reason: null }, context(MARSHAL))).state.matches[0]?.status).toBe('cancelled');
    expect(refusalCode(cancelMatch(live(), { matchId: 'm1', reason: null }, context(OTHER_MARSHAL)))).toBe('not_allowed');
  });

  it('lets a superadmin cancel only with a reason', () => {
    expect(refusalCode(cancelMatch(live(), { matchId: 'm1', reason: '  ' }, context(DESK)))).toBe('reason_required');
    expect(ok(cancelMatch(live(), { matchId: 'm1', reason: 'rain' }, context(DESK))).state.matches[0]?.cancelReason).toBe('rain');
  });

  it('refuses a finished match and an unknown one', () => {
    const done = state({ matches: [match({ id: 'm1', status: 'completed' })] });
    expect(refusalCode(cancelMatch(done, { matchId: 'm1', reason: 'x' }, context(DESK)))).toBe('wrong_status');
    expect(refusalCode(cancelMatch(done, { matchId: 'nope', reason: 'x' }, context(DESK)))).toBe('not_found');
  });

  it('refuses to strand an unseated dependant that reads its winner (ADR-329 F4)', () => {
    const value = state({
      matches: [
        match({ id: 'm1', status: 'in_progress', startedBy: MARSHAL }),
        match({
          id: 'm2',
          slots: {
            a: { source: { kind: 'winner_of', matchId: 'm1' }, label: 'Winner of M1', seatedEntrantId: null, seatOverrideReason: null },
            b: seated('e3'),
          },
        }),
      ],
    });
    expect(refusalCode(cancelMatch(value, { matchId: 'm1', reason: 'rain' }, context(DESK)))).toBe('has_dependents');
    const seatedDependant = {
      ...value,
      matches: value.matches.map((row) =>
        row.id === 'm2' ? { ...row, slots: { ...row.slots, a: { ...row.slots.a, seatedEntrantId: 'e1' } } } : row,
      ),
    };
    expect(ok(cancelMatch(seatedDependant, { matchId: 'm1', reason: 'rain' }, context(DESK))).state.matches[0]?.status).toBe('cancelled');
  });
});
