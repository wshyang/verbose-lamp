import { describe, expect, it } from 'vitest';
import { callOff, queuedMatchFor, startPair } from '../core/claims.js';
import { releaseMatch } from '../core/lifecycle.js';
import { DESK, MARSHAL, OTHER_MARSHAL, context, entrantSlot, match, matchIn, ok, refusalCode, state } from './fixtures.js';

/** ADR-277 — the court console's start and cancel buttons against the schedule. */

const pair = (a: string, b: string, courtId = 'c1') => ({ courtId, entrantAId: a, entrantBId: b, plannedMinutes: 12 });

function queued() {
  return state({
    matches: [
      match({ id: 'q1', sequence: 1, courtId: 'c2' }),
      match({ id: 'q2', sequence: 2, courtId: 'c1' }),
      match({ id: 'q3', sequence: 3, slots: { a: entrantSlot('e1'), b: entrantSlot('e3') } }),
    ],
  });
}

describe('startPair — claim what the schedule owes, else stage ad hoc', () => {
  it('claims the queued match for the pair, preferring this court, whatever order the teams were picked in', () => {
    expect(queuedMatchFor(queued(), pair('e2', 'e1', 'c1'))?.id).toBe('q2');
    expect(queuedMatchFor(queued(), pair('e1', 'e2', 'c3'))?.id).toBe('q1');
    const result = ok(startPair(queued(), pair('e2', 'e1', 'c1'), context(MARSHAL)));
    expect(matchIn(result.state, 'q2')).toMatchObject({ status: 'in_progress', courtId: 'c1', origin: 'structure' });
    expect(result.state.matches).toHaveLength(3);
  });

  it('stages an ad-hoc match for a pair the schedule does not owe', () => {
    const result = ok(startPair(queued(), pair('e2', 'e4'), context(MARSHAL, ['adhoc'])));
    expect(matchIn(result.state, 'adhoc')).toMatchObject({ status: 'in_progress', origin: 'ad_hoc', courtId: 'c1' });
    expect(result.events.map((event) => event.kind)).toEqual(['match_staged', 'match_started']);
  });

  it('refuses the same team twice before looking anything up', () => {
    expect(refusalCode(startPair(queued(), pair('e1', 'e1'), context(MARSHAL)))).toBe('same_entrant');
  });
});

function live(origin: 'structure' | 'ad_hoc') {
  const chosen = origin === 'structure' ? pair('e1', 'e2') : pair('e2', 'e4');
  const started = ok(startPair(queued(), chosen, context(MARSHAL, ['adhoc'])));
  return { value: started.state, id: origin === 'structure' ? 'q2' : 'adhoc' };
}

describe('callOff — the cancel button', () => {
  it('hands a claimed match back to the queue: still owed, seats kept, score cleared', () => {
    const { value, id } = live('structure');
    const result = ok(callOff(value, { matchId: id }, context(MARSHAL)));
    const back = matchIn(result.state, id);
    expect(back).toMatchObject({ status: 'scheduled', startedAt: null, startedBy: null, scoreA: 0, scoreB: 0 });
    expect(back.slots.a.seatedEntrantId).toBe('e1');
    expect(result.events.map((event) => event.kind)).toEqual(['match_released']);
  });

  it('cancels an ad-hoc match outright', () => {
    const { value, id } = live('ad_hoc');
    expect(matchIn(ok(callOff(value, { matchId: id }, context(MARSHAL))).state, id).status).toBe('cancelled');
  });

  it('refuses another facilitator, a match that is not live, and an unknown one', () => {
    const { value, id } = live('structure');
    expect(refusalCode(callOff(value, { matchId: id }, context(OTHER_MARSHAL)))).toBe('not_allowed');
    expect(refusalCode(callOff(queued(), { matchId: 'q1' }, context(MARSHAL)))).toBe('wrong_status');
    expect(refusalCode(callOff(queued(), { matchId: 'nope' }, context(MARSHAL)))).toBe('not_found');
  });
});

describe('releaseMatch — the claim undone', () => {
  it('lets a superadmin hand a match back, and never an ad-hoc one or one that is not live', () => {
    const { value, id } = live('structure');
    expect(matchIn(ok(releaseMatch(value, { matchId: id }, context(DESK))).state, id).status).toBe('scheduled');
    const adhoc = live('ad_hoc');
    expect(refusalCode(releaseMatch(adhoc.value, { matchId: adhoc.id }, context(DESK)))).toBe('wrong_status');
    expect(refusalCode(releaseMatch(queued(), { matchId: 'q1' }, context(DESK)))).toBe('wrong_status');
    expect(refusalCode(releaseMatch(queued(), { matchId: 'nope' }, context(DESK)))).toBe('not_found');
  });
});
