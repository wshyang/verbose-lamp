import { describe, expect, it } from 'vitest';
import { closeTournament, pauseTournament, withdrawEntrant } from '../core/stages.js';
import { completeMatch, scoreStep, startMatch } from '../core/lifecycle.js';
import { startPair } from '../core/claims.js';
import { awardPoints } from '../core/awards.js';
import { correctResult } from '../core/corrections.js';
import { DESK, MARSHAL, SYSTEM, context, entrantSlot, match, ok, refusalCode, state } from './fixtures.js';

/**
 * ADR-336 — the pause, as the core sees it.
 *
 * A paused tournament starts nothing and allows everything else. That asymmetry is the whole point:
 * the switch to court awards must never reroute a court out from under a match being scored, so the
 * only thing the pause takes away is the ability to put a NEW match on a court.
 *
 * There is deliberately no `resumeTournament` to test. `import { resumeTournament }` does not
 * compile, which is the enforcement: one-way is a fact of the machine, not a policy in a probe.
 */

const queued = () => state({ matches: [match({ id: 'm1', courtId: 'c1' }), match({ id: 'm2', sequence: 2 })] });
const paused = (value = queued()) => ok(pauseTournament(value, { reason: 'Lightning over the courts.' }, context(DESK))).state;

describe('pauseTournament — one desk act, and only the desk', () => {
  it('records the instant and the reason, and says so in the day’s history', () => {
    const result = ok(pauseTournament(queued(), { reason: 'Lightning over the courts.' }, context(DESK)));
    expect(result.state.tournament.pausedAt).not.toBeNull();
    expect(result.events.map((event) => event.kind)).toEqual(['tournament_paused']);
    expect(result.events[0]?.reason).toBe('Lightning over the courts.');
    // Nothing else about the day moved: no match, no stage, no seat.
    expect(result.state.matches).toEqual(queued().matches);
    expect(result.state.tournament.status).toBe('live');
  });

  it('refuses a facilitator, a missing reason, and a closed day', () => {
    expect(refusalCode(pauseTournament(queued(), { reason: 'Because.' }, context(MARSHAL)))).toBe('not_allowed');
    expect(refusalCode(pauseTournament(queued(), { reason: '   ' }, context(DESK)))).toBe('reason_required');
    const closed = state({ tournament: { ...queued().tournament, status: 'closed' } });
    expect(refusalCode(pauseTournament(closed, { reason: 'Too late.' }, context(DESK)))).toBe('tournament_closed');
  });

  it('is idempotent: a second tap is a success that changes nothing and writes no second event', () => {
    const once = paused();
    const twice = ok(pauseTournament(once, { reason: 'Again.' }, context(DESK)));
    expect(twice.state.tournament.pausedAt).toBe(once.tournament.pausedAt);
    expect(twice.events).toEqual([]);
  });
});

describe('a paused day starts nothing', () => {
  it('refuses a scheduled match going on court', () => {
    expect(refusalCode(startMatch(paused(), { matchId: 'm1', courtId: 'c1' }, context(MARSHAL)))).toBe(
      'tournament_paused',
    );
  });

  it('refuses the court console’s two-name start, whether it would claim or stage', () => {
    const pair = { courtId: 'c1', entrantAId: 'e1', entrantBId: 'e2', plannedMinutes: 12 };
    // m1 is the queued match for this pair (e1 v e2, on c1), so this would have claimed it.
    expect(refusalCode(startPair(paused(), pair, context(MARSHAL, ['adhoc'])))).toBe('tournament_paused');
    // A pair the schedule does not owe would have been staged ad hoc — still refused, and nothing
    // is created: a refused command writes nothing.
    const stranger = { ...pair, entrantAId: 'e2', entrantBId: 'e4' };
    expect(refusalCode(startPair(paused(), stranger, context(MARSHAL, ['adhoc'])))).toBe('tournament_paused');
  });
});

describe('a paused day finishes everything already on it', () => {
  /** A day paused with m1 already live on c1 — the state the switch actually leaves behind. */
  function withLiveMatch() {
    const started = ok(startMatch(queued(), { matchId: 'm1', courtId: 'c1' }, context(MARSHAL)));
    const day = ok(pauseTournament(started.state, { reason: 'Weather.' }, context(DESK))).state;
    return { day, liveId: 'm1' };
  }

  it('scores, completes and pays a live match at its rates', () => {
    const { day, liveId } = withLiveMatch();
    const scored = ok(scoreStep(day, { matchId: liveId, side: 'a', from: 0, to: 1 }, context(MARSHAL)));
    const done = ok(completeMatch(scored.state, { matchId: liveId, namedWinner: null }, context(MARSHAL)));
    // The winner is read off the score; the day's own rates pay it.
    expect(done.state.matches.find((row) => row.id === liveId)?.status).toBe('completed');
    expect(done.state.awards.map((award) => award.points).sort((a, b) => b - a)).toEqual([30, 10]);
  });

  it('corrects, awards and closes', () => {
    const { day, liveId } = withLiveMatch();
    // 0 - 0 names nobody in a stage that does not allow draws, so the score comes first.
    const scored = ok(scoreStep(day, { matchId: liveId, side: 'a', from: 0, to: 1 }, context(MARSHAL)));
    const finished = ok(completeMatch(scored.state, { matchId: liveId, namedWinner: null }, context(MARSHAL))).state;
    const corrected = ok(
      correctResult(finished, { matchId: liveId, scoreA: 0, scoreB: 3, namedWinner: null, reason: 'Entered the wrong way round.' }, context(DESK)),
    );
    expect(corrected.state.matches.find((row) => row.id === liveId)?.scoreB).toBe(3);
    const awarded = ok(
      awardPoints(corrected.state, { entrantId: 'e1', points: 5, reason: 'Fair play.' }, context(DESK)),
    );
    expect(awarded.state.awards.at(-1)?.points).toBe(5);
    // The desk can still end the day — and the system can, which is how the drain closes the bracket.
    expect(ok(closeTournament(awarded.state, { reason: 'Day ended early.' }, context(DESK))).state.tournament.status).toBe(
      'closed',
    );
    expect(ok(closeTournament(awarded.state, { reason: 'Drain complete.' }, context(SYSTEM))).state.tournament.status).toBe(
      'closed',
    );
  });

  it('still allows the desk to seat somebody or withdraw a team — a pause is not a freeze', () => {
    const { day } = withLiveMatch();
    // e4 has no match, so withdrawing them is a normal, allowed act while paused.
    const withdrawn = ok(withdrawEntrant(day, { entrantId: 'e4', reason: 'Went home.' }, context(DESK)));
    expect(withdrawn.state.entrants.find((entrant) => entrant.id === 'e4')?.withdrawnAt).not.toBeNull();
    expect(entrantSlot('e4')).toBeDefined();
  });
});
