import { describe, expect, it } from 'vitest';
import { awardPoints, awardTotals, voidAward } from '../core/awards.js';
import { correctResult, openSeatConflicts, recordWalkover, reseat, setMatchVoided } from '../core/corrections.js';
import { closeTournament, completeStage, stagePlaces, withdrawEntrant } from '../core/stages.js';
import type { Award, Group, Match, TournamentState } from '../core/types.js';
import { DESK, MARSHAL, SYSTEM, context, match, matchIn, ok, refusalCode, slotOf, stage, state } from './fixtures.js';

function seatedSlot(entrantId: string) {
  return { ...slotOf({ kind: 'entrant', entrantId }), seatedEntrantId: entrantId };
}

function finished(id: string, input: { a: string; b: string; scoreA: number; scoreB: number; groupId?: string }): Match {
  const winnerSide = input.scoreA === input.scoreB ? null : input.scoreA > input.scoreB ? 'a' : 'b';
  return match({
    id,
    groupId: input.groupId ?? null,
    status: 'completed',
    scoreA: input.scoreA,
    scoreB: input.scoreB,
    result: { kind: 'score', winnerSide },
    slots: { a: seatedSlot(input.a), b: seatedSlot(input.b) },
  });
}

function resultAward(id: string, input: { entrantId: string; matchId: string; points: number }): Award {
  return { id, entrantId: input.entrantId, matchId: input.matchId, kind: 'result', points: input.points, reason: 'x', createdAt: 't', voidedAt: null };
}

const semiPaid = (): TournamentState =>
  state({
    stages: [stage({ allowsDraws: false, kind: 'bracket' })],
    matches: [
      finished('sf', { a: 'e1', b: 'e2', scoreA: 3, scoreB: 1 }),
      match({ id: 'f', slots: { a: slotOf({ kind: 'winner_of', matchId: 'sf' }), b: seatedSlot('e3') } }),
    ],
    awards: [resultAward('r1', { entrantId: 'e1', matchId: 'sf', points: 30 }), resultAward('r2', { entrantId: 'e2', matchId: 'sf', points: 10 })],
  });

function withFrozenFinal(value: TournamentState): TournamentState {
  const frozen = { ...slotOf({ kind: 'winner_of', matchId: 'sf' }), seatedEntrantId: 'e1' };
  return { ...value, matches: value.matches.map((row) => (row.id === 'f' ? { ...row, slots: { ...row.slots, a: frozen } } : row)) };
}

describe('correctResult — requirement 4: corrections that move tables, not people', () => {
  it('re-pays the corrected result and lets an unseated dependent follow it', () => {
    const result = ok(
      correctResult(semiPaid(), { matchId: 'sf', scoreA: 1, scoreB: 3, namedWinner: null, reason: 'scores swapped' }, context(DESK, ['r3', 'r4'])),
    );
    expect(matchIn(result.state, 'sf').result?.winnerSide).toBe('b');
    expect(awardTotals(result.state).get('e2')).toBe(30);
    expect(awardTotals(result.state).get('e1')).toBe(10);
    expect(result.events.map((event) => event.kind)).toEqual(['result_corrected']);
  });

  it('flags, and never moves, a dependent seat that was already frozen', () => {
    const result = ok(
      correctResult(withFrozenFinal(semiPaid()), { matchId: 'sf', scoreA: 0, scoreB: 2, namedWinner: null, reason: 'misread' }, context(DESK, ['r3', 'r4'])),
    );
    expect(matchIn(result.state, 'f').slots.a.seatedEntrantId).toBe('e1');
    expect(result.events.map((event) => event.kind)).toEqual(['result_corrected', 'seat_conflict']);
  });

  it('refuses facilitators, missing reasons, bracket draws, bad scores and unfinished matches', () => {
    const correct = (input: { matchId?: string; scoreA?: number; scoreB?: number; reason?: string }, actor = DESK) =>
      refusalCode(
        correctResult(
          semiPaid(),
          { matchId: input.matchId ?? 'sf', scoreA: input.scoreA ?? 1, scoreB: input.scoreB ?? 0, namedWinner: null, reason: input.reason ?? 'x' },
          context(actor),
        ),
      );
    expect(correct({}, MARSHAL)).toBe('not_allowed');
    expect(correct({ reason: ' ' })).toBe('reason_required');
    expect(correct({ scoreA: 2, scoreB: 2 })).toBe('play_on');
    expect(correct({ matchId: 'f' })).toBe('wrong_status');
    expect(correct({ matchId: 'nope' })).toBe('not_found');
    expect(correct({ scoreA: -1 })).toBe('bad_step');
  });
});

describe('walkover and void', () => {
  it('records a walkover without a score and pays it', () => {
    const value = state({ matches: [match({ id: 'm1' })] });
    const result = ok(recordWalkover(value, { matchId: 'm1', winnerSide: 'b', reason: 'no-show' }, context(DESK, ['w1', 'w2'])));
    expect(matchIn(result.state, 'm1')).toMatchObject({ status: 'completed', result: { kind: 'walkover', winnerSide: 'b' }, scoreA: 0 });
    expect(awardTotals(result.state).get('e2')).toBe(30);
  });

  it('refuses a walkover for unknown teams, a cancelled match, and without a reason', () => {
    const vacant = state({ matches: [match({ id: 'm1', slots: { a: slotOf({ kind: 'vacant' }), b: seatedSlot('e2') } })] });
    expect(refusalCode(recordWalkover(vacant, { matchId: 'm1', winnerSide: 'b', reason: 'x' }, context(DESK)))).toBe('seat_unresolved');
    const cancelled = state({ matches: [match({ id: 'm1', status: 'cancelled' })] });
    expect(refusalCode(recordWalkover(cancelled, { matchId: 'm1', winnerSide: 'b', reason: 'x' }, context(DESK)))).toBe('wrong_status');
    expect(refusalCode(recordWalkover(state({ matches: [match({ id: 'm1' })] }), { matchId: 'm1', winnerSide: 'b', reason: '' }, context(DESK)))).toBe('reason_required');
    expect(refusalCode(recordWalkover(state(), { matchId: 'nope', winnerSide: 'b', reason: 'x' }, context(DESK)))).toBe('not_found');
  });

  it('voids and unvoids, taking the result awards away and back', () => {
    const voided = ok(setMatchVoided(semiPaid(), { matchId: 'sf', isVoided: true, reason: 'wrong teams' }, context(DESK)));
    expect(awardTotals(voided.state).get('e1')).toBeUndefined();
    expect(refusalCode(setMatchVoided(voided.state, { matchId: 'sf', isVoided: true, reason: 'x' }, context(DESK)))).toBe('wrong_status');
    expect(refusalCode(setMatchVoided(semiPaid(), { matchId: 'sf', isVoided: false, reason: 'x' }, context(DESK)))).toBe('wrong_status');
    expect(refusalCode(setMatchVoided(semiPaid(), { matchId: 'sf', isVoided: true, reason: '' }, context(DESK)))).toBe('reason_required');
    const back = ok(setMatchVoided(voided.state, { matchId: 'sf', isVoided: false, reason: 'right after all' }, context(DESK, ['r5', 'r6'])));
    expect(awardTotals(back.state).get('e1')).toBe(30);
  });
});

describe('openSeatConflicts — frozen seats the table would now move (ADR-329 F3)', () => {
  it('reports a scheduled frozen seat whose source now resolves elsewhere, and ignores finished matches', () => {
    const base = semiPaid();
    const reversed: TournamentState = {
      ...base,
      matches: base.matches.map((row) =>
        row.id === 'sf'
          ? { ...row, scoreA: 1, scoreB: 3, result: { kind: 'score' as const, winnerSide: 'b' as const } }
          : row.id === 'f'
            ? { ...row, slots: { ...row.slots, a: { ...row.slots.a, seatedEntrantId: 'e1' } } }
            : row,
      ),
    };
    expect(openSeatConflicts(reversed)).toEqual([
      { matchId: 'f', side: 'a', seatedEntrantId: 'e1', wouldBeEntrantId: 'e2' },
    ]);
    const finished = {
      ...reversed,
      matches: reversed.matches.map((row) => (row.id === 'f' ? { ...row, status: 'completed' as const } : row)),
    };
    expect(openSeatConflicts(finished)).toEqual([]);
  });
});

describe('reseat — the desk names a person', () => {
  it('seats an entrant with the reason kept, only before the match starts', () => {
    const result = ok(reseat(semiPaid(), { matchId: 'f', side: 'a', entrantId: 'e4', reason: 'ruled at the desk' }, context(DESK)));
    expect(matchIn(result.state, 'f').slots.a).toMatchObject({ seatedEntrantId: 'e4', seatOverrideReason: 'ruled at the desk' });
    expect(refusalCode(reseat(semiPaid(), { matchId: 'sf', side: 'a', entrantId: 'e4', reason: 'x' }, context(DESK)))).toBe('wrong_status');
    expect(refusalCode(reseat(semiPaid(), { matchId: 'f', side: 'a', entrantId: 'nope', reason: 'x' }, context(DESK)))).toBe('entrant_withdrawn');
    expect(refusalCode(reseat(semiPaid(), { matchId: 'f', side: 'a', entrantId: 'e4', reason: '' }, context(DESK)))).toBe('reason_required');
    expect(refusalCode(reseat(semiPaid(), { matchId: 'zz', side: 'a', entrantId: 'e4', reason: 'x' }, context(DESK)))).toBe('not_found');
  });
});

const groupA: Group = { id: 'gA', stageId: 's1', code: 'A', label: 'Group A', entrantIds: ['e1', 'e2', 'e3'] };

function poolDay(scores: { ab: [number, number]; bc: [number, number]; ac: [number, number] }): TournamentState {
  return state({
    stages: [stage({ advanceCount: 1 }), stage({ id: 's2', ordinal: 2, label: 'Final', kind: 'bracket', allowsDraws: false, status: 'pending' })],
    groups: [groupA],
    matches: [
      finished('m1', { a: 'e1', b: 'e2', scoreA: scores.ab[0], scoreB: scores.ab[1], groupId: 'gA' }),
      finished('m2', { a: 'e2', b: 'e3', scoreA: scores.bc[0], scoreB: scores.bc[1], groupId: 'gA' }),
      finished('m3', { a: 'e1', b: 'e3', scoreA: scores.ac[0], scoreB: scores.ac[1], groupId: 'gA' }),
      match({ id: 'fin', stageId: 's2', slots: { a: slotOf({ kind: 'group_place', groupId: 'gA', place: 1 }), b: seatedSlot('e4') } }),
    ],
  });
}

const CLEAN_WIN = { ab: [2, 0], bc: [1, 0], ac: [3, 0] } as const;

describe('completeStage — requirement 5: advancing the stage', () => {
  it('seats the winners downstream and opens the next stage', () => {
    const result = ok(completeStage(poolDay({ ...CLEAN_WIN, ab: [2, 0], bc: [1, 0], ac: [3, 0] }), { stageId: 's1', overrides: [], reason: null }, context(DESK)));
    expect(matchIn(result.state, 'fin').slots.a.seatedEntrantId).toBe('e1');
    expect(result.state.stages.map((row) => row.status)).toEqual(['completed', 'active']);
  });

  it('lets the desk overrule the table with a reason, never without one', () => {
    const value = poolDay({ ab: [2, 0], bc: [1, 0], ac: [3, 0] });
    const overrides = [{ matchId: 'fin', side: 'a' as const, entrantId: 'e2' }];
    expect(refusalCode(completeStage(value, { stageId: 's1', overrides, reason: null }, context(DESK)))).toBe('reason_required');
    const ruled = ok(completeStage(value, { stageId: 's1', overrides, reason: 'Reds left early' }, context(DESK)));
    expect(matchIn(ruled.state, 'fin').slots.a).toMatchObject({ seatedEntrantId: 'e2', seatOverrideReason: 'Reds left early' });
  });

  it('will not let the scheduler decide a tie on the cut line', () => {
    const tied = poolDay({ ab: [1, 1], bc: [1, 1], ac: [1, 1] });
    expect(refusalCode(completeStage(tied, { stageId: 's1', overrides: [], reason: null }, context(SYSTEM)))).toBe('tie_on_cut');
    expect(ok(completeStage(tied, { stageId: 's1', overrides: [], reason: null }, context(DESK))).events[0]?.detail).toMatchObject({ tiesOnCut: 1 });
  });

  it('refuses an unfinished stage, a completed one, an unknown one and a facilitator', () => {
    const value = poolDay({ ab: [2, 0], bc: [1, 0], ac: [3, 0] });
    const open = { ...value, matches: [...value.matches, match({ id: 'm4', groupId: 'gA' })] };
    expect(refusalCode(completeStage(open, { stageId: 's1', overrides: [], reason: null }, context(DESK)))).toBe('stage_unfinished');
    expect(refusalCode(completeStage(value, { stageId: 's1', overrides: [], reason: null }, context(MARSHAL)))).toBe('not_allowed');
    expect(refusalCode(completeStage(value, { stageId: 'zz', overrides: [], reason: null }, context(DESK)))).toBe('not_found');
    const done = ok(completeStage(value, { stageId: 's1', overrides: [], reason: null }, context(DESK))).state;
    expect(refusalCode(completeStage(done, { stageId: 's1', overrides: [], reason: null }, context(DESK)))).toBe('wrong_status');
    expect(stagePlaces(done, stage()).map((row) => row.entrantId)).toEqual(['e1']);
  });
});

describe('awards, withdrawal and close', () => {
  it('awards and voids manual points with reasons and bounds (requirement 6)', () => {
    const granted = ok(awardPoints(state(), { entrantId: 'e1', points: 15, reason: 'spirit award' }, context(DESK, ['a1'])));
    expect(awardTotals(granted.state).get('e1')).toBe(15);
    expect(refusalCode(awardPoints(state(), { entrantId: 'e1', points: 0, reason: 'x' }, context(DESK)))).toBe('points_invalid');
    expect(refusalCode(awardPoints(state(), { entrantId: 'e1', points: 5, reason: '' }, context(DESK)))).toBe('reason_required');
    expect(refusalCode(awardPoints(state(), { entrantId: 'e1', points: 5, reason: 'x' }, context(MARSHAL)))).toBe('not_allowed');
    expect(refusalCode(awardPoints(state(), { entrantId: 'zz', points: 5, reason: 'x' }, context(DESK)))).toBe('not_found');
    const voided = ok(voidAward(granted.state, { awardId: 'a1', reason: 'duplicate' }, context(DESK)));
    expect(awardTotals(voided.state).get('e1')).toBeUndefined();
    expect(refusalCode(voidAward(voided.state, { awardId: 'a1', reason: 'x' }, context(DESK)))).toBe('wrong_status');
    expect(refusalCode(voidAward(granted.state, { awardId: 'a1', reason: '' }, context(DESK)))).toBe('reason_required');
    expect(refusalCode(voidAward(granted.state, { awardId: 'zz', reason: 'x' }, context(DESK)))).toBe('not_found');
    expect(refusalCode(voidAward(granted.state, { awardId: 'a1', reason: 'x' }, context(MARSHAL)))).toBe('not_allowed');
  });

  it('lets a court master award and take back points only in dumb mode (ADR-321)', () => {
    const dumb = state({ tournament: { id: 't1', name: 'Day', status: 'live', kind: 'dumb_courts', rates: { win: 30, draw: 10, loss: 0 }, closeReason: null, pausedAt: null } });
    const granted = ok(awardPoints(dumb, { entrantId: 'e1', points: 10, reason: 'Gold · Fun Day' }, context(MARSHAL, ['d1'])));
    expect(awardTotals(granted.state).get('e1')).toBe(10);
    const voided = ok(voidAward(granted.state, { awardId: 'd1', reason: 'wrong team' }, context(MARSHAL)));
    expect(awardTotals(voided.state).get('e1')).toBeUndefined();
    // Captain's ball keeps the desk-only rule, and dumb mode keeps the desk's powers too.
    expect(refusalCode(awardPoints(state(), { entrantId: 'e1', points: 5, reason: 'x' }, context(MARSHAL)))).toBe('not_allowed');
    expect(awardTotals(ok(voidAward(granted.state, { awardId: 'd1', reason: 'x' }, context(DESK))).state).get('e1')).toBeUndefined();
  });

  it('withdraws a team: results stand, unplayed matches become holes', () => {
    const value = state({ matches: [finished('m1', { a: 'e1', b: 'e2', scoreA: 1, scoreB: 0 }), match({ id: 'm2', slots: { a: seatedSlot('e1'), b: seatedSlot('e3') } })] });
    const result = ok(withdrawEntrant(value, { entrantId: 'e1', reason: 'train home' }, context(DESK)));
    expect(matchIn(result.state, 'm1').status).toBe('completed');
    expect(matchIn(result.state, 'm2')).toMatchObject({ status: 'cancelled', cancelReason: 'Reds withdrew: train home' });
    expect(refusalCode(withdrawEntrant(result.state, { entrantId: 'e1', reason: 'x' }, context(DESK)))).toBe('wrong_status');
    expect(refusalCode(withdrawEntrant(value, { entrantId: 'e1', reason: '' }, context(DESK)))).toBe('reason_required');
    const live = state({ matches: [match({ id: 'm3', status: 'in_progress', slots: { a: seatedSlot('e1'), b: seatedSlot('e2') } })] });
    expect(refusalCode(withdrawEntrant(live, { entrantId: 'e1', reason: 'x' }, context(DESK)))).toBe('live_match');
    expect(refusalCode(withdrawEntrant(value, { entrantId: 'e1', reason: 'x' }, context(MARSHAL)))).toBe('not_allowed');
  });

  it('withdraws a team from the seats that name it but are not yet frozen (a round robin before kick-off)', () => {
    const named = match({ id: 'm4', slots: { a: slotOf({ kind: 'entrant', entrantId: 'e1' }), b: slotOf({ kind: 'entrant', entrantId: 'e3' }) } });
    const forecast = match({ id: 'm5', slots: { a: slotOf({ kind: 'winner_of', matchId: 'm4' }), b: seatedSlot('e2') } });
    const result = ok(withdrawEntrant(state({ matches: [named, forecast] }), { entrantId: 'e1', reason: 'train home' }, context(DESK)));
    expect(matchIn(result.state, 'm4').status).toBe('cancelled');
    // A forecast that only might be the team stays: who fills it is still undecided.
    expect(matchIn(result.state, 'm5').status).toBe('scheduled');
  });

  it('closes the day only with nothing live, and with a reason when it ends early', () => {
    const unfinished = state({ matches: [match({ id: 'm1' })] });
    expect(refusalCode(closeTournament(unfinished, { reason: null }, context(DESK)))).toBe('reason_required');
    const closed = ok(closeTournament(unfinished, { reason: 'rain' }, context(DESK)));
    expect(closed.state.tournament).toMatchObject({ status: 'closed', closeReason: 'rain' });
    expect(refusalCode(closeTournament(closed.state, { reason: 'x' }, context(DESK)))).toBe('tournament_closed');
    const live = state({ matches: [match({ id: 'm1', status: 'in_progress' })] });
    expect(refusalCode(closeTournament(live, { reason: 'x' }, context(DESK)))).toBe('live_match');
    expect(refusalCode(closeTournament(unfinished, { reason: 'x' }, context(MARSHAL)))).toBe('not_allowed');
  });
});
