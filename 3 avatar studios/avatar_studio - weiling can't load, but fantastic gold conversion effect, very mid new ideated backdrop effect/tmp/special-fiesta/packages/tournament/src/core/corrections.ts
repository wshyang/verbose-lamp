import { resultAwardsFor, voidResultAwards } from './awards.js';
import { decideWinner } from './lifecycle.js';
import { resolveSource } from './seats.js';
import { accept, cleanReason, eventOf, findMatchById, isSuperadmin, refuse, refuseWhenClosed, withMatch } from './state.js';
import type {
  CommandContext,
  CommandResult,
  Match,
  Side,
  Slot,
  TournamentEvent,
  TournamentState,
} from './types.js';

/**
 * ADR-273 §3 — requirement 4: putting a result right without making it up (P-09).
 *
 * A correction re-reads the result and re-pays it: the old result awards are voided and new ones
 * written in the same decision. What it never does is move a person who has already been sent
 * somewhere. Every dependent seat that is already frozen and would now resolve differently is
 * reported as a `seat_conflict` event for the desk to settle with `reseat`; the unfrozen ones were
 * only ever forecasts, so they simply read the new result.
 */

/** ADR-329 F3 — one frozen seat that the results, as they now stand, would fill differently. */
export interface SeatConflict {
  matchId: string;
  side: Side;
  seatedEntrantId: string;
  wouldBeEntrantId: string | null;
}

/**
 * The seat conflicts still open in this state: scheduled matches whose frozen seat no longer
 * matches what its source resolves to. Finished matches are history, and a seat the desk
 * overruled on purpose (`seatOverrideReason`) is a decision, not a conflict.
 */
export function openSeatConflicts(state: TournamentState): SeatConflict[] {
  const conflicts: SeatConflict[] = [];
  for (const match of state.matches) {
    if (match.status !== 'scheduled') continue;
    for (const side of ['a', 'b'] as const) {
      const slot = match.slots[side];
      if (slot.seatedEntrantId === null || slot.source.kind === 'entrant' || slot.seatOverrideReason !== null) continue;
      const wouldBe = resolveSource(state, slot.source);
      if (wouldBe === slot.seatedEntrantId) continue;
      conflicts.push({ matchId: match.id, side, seatedEntrantId: slot.seatedEntrantId, wouldBeEntrantId: wouldBe });
    }
  }
  return conflicts;
}

function seatConflicts(state: TournamentState, input: { context: CommandContext; reason: string }): TournamentEvent[] {
  return openSeatConflicts(state).map((conflict) =>
    eventOf(input.context, {
      kind: 'seat_conflict',
      matchId: conflict.matchId,
      reason: input.reason,
      detail: { side: conflict.side, seated: conflict.seatedEntrantId, wouldBe: conflict.wouldBeEntrantId },
    }),
  );
}

function requireDesk(state: TournamentState, context: CommandContext): CommandResult | null {
  if (!isSuperadmin(context.actor)) return refuse('not_allowed', 'Only a superadmin can correct a result.');
  return refuseWhenClosed(state);
}

/** Re-pays a match whose result just changed, and reports the seats it would have moved. */
function repay(state: TournamentState, input: { next: Match; context: CommandContext; reason: string }): {
  state: TournamentState;
  conflicts: TournamentEvent[];
} {
  const { next, context } = input;
  const voided = { ...withMatch(state, next), awards: voidResultAwards(state, { matchId: next.id, now: context.now }) };
  const fresh = resultAwardsFor(voided, { match: next, context, firstIdIndex: 0 });
  const paid = { ...voided, awards: [...voided.awards, ...fresh] };
  return { state: paid, conflicts: seatConflicts(paid, { context, reason: input.reason }) };
}

function findCorrectable(state: TournamentState, matchId: string): Match | CommandResult {
  const match = findMatchById(state, matchId);
  if (match === undefined) return refuse('not_found', 'No such match.');
  if (match.status !== 'completed') return refuse('wrong_status', 'Only a finished match can be corrected.');
  return match;
}

export interface CorrectResultCommand {
  matchId: string;
  scoreA: number;
  scoreB: number;
  namedWinner: Side | null;
  tiebreakMethod?: 'coin_toss' | 'rock_paper_scissors' | null;
  reason: string;
}

function isScore(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** The desk restates the whole result, under the court's rule (ADR-157, kept). */
export function correctResult(state: TournamentState, command: CorrectResultCommand, context: CommandContext): CommandResult {
  const refusal = requireDesk(state, context);
  if (refusal) return refusal;
  const match = findCorrectable(state, command.matchId);
  if (!('slots' in match)) return match;
  const reason = cleanReason(command.reason);
  if (reason === null) return refuse('reason_required', 'Say why this result is being corrected.');
  if (!isScore(command.scoreA) || !isScore(command.scoreB)) return refuse('bad_step', 'Scores must be whole numbers, zero or more.');
  const decided = decideWinner(state, {
    match,
    scoreA: command.scoreA,
    scoreB: command.scoreB,
    namedWinner: command.namedWinner,
    tiebreakMethod: command.tiebreakMethod ?? null,
  });
  if ('refusal' in decided) return decided.refusal;
  const next: Match = {
    ...match,
    scoreA: command.scoreA,
    scoreB: command.scoreB,
    result: { kind: 'score', winnerSide: decided.winnerSide },
    version: match.version + 1,
  };
  const paid = repay(state, { next, context, reason });
  const method = command.tiebreakMethod ?? null;
  const event = eventOf(context, {
    kind: 'result_corrected',
    matchId: match.id,
    reason,
    detail:
      method === null
        ? { scoreA: command.scoreA, scoreB: command.scoreB, winnerSide: decided.winnerSide }
        : { scoreA: command.scoreA, scoreB: command.scoreB, winnerSide: decided.winnerSide, tiebreakMethod: method },
  });
  return accept(paid.state, [event, ...paid.conflicts]);
}

function frozenSlots(state: TournamentState, match: Match): { a: Slot; b: Slot } | null {
  const freeze = (slot: Slot): Slot | null => {
    const occupant = slot.seatedEntrantId ?? resolveSource(state, slot.source);
    return occupant === null ? null : { ...slot, seatedEntrantId: occupant };
  };
  const a = freeze(match.slots.a);
  const b = freeze(match.slots.b);
  return a === null || b === null ? null : { a, b };
}

/** A result without a score (Q2): the team that never appeared loses without a fictional score. */
export function recordWalkover(
  state: TournamentState,
  command: { matchId: string; winnerSide: Side; reason: string },
  context: CommandContext,
): CommandResult {
  const refusal = requireDesk(state, context);
  if (refusal) return refusal;
  const match = findMatchById(state, command.matchId);
  if (match === undefined) return refuse('not_found', 'No such match.');
  if (match.status === 'cancelled' || match.isVoided) return refuse('wrong_status', 'This match cannot take a walkover.');
  const reason = cleanReason(command.reason);
  if (reason === null) return refuse('reason_required', 'Say why this is a walkover.');
  const slots = frozenSlots(state, match);
  if (slots === null) return refuse('seat_unresolved', 'Both teams of this match are not known yet.');
  const next: Match = {
    ...match,
    status: 'completed',
    startedAt: match.startedAt ?? context.now,
    endedAt: context.now,
    scoreA: 0,
    scoreB: 0,
    result: { kind: 'walkover', winnerSide: command.winnerSide },
    version: match.version + 1,
    slots,
  };
  const paid = repay(state, { next, context, reason });
  const event = eventOf(context, { kind: 'walkover_recorded', matchId: match.id, reason, detail: { winnerSide: command.winnerSide } });
  return accept(paid.state, [event, ...paid.conflicts]);
}

/** F44 — void and unvoid: reversible, explained, excluded from every table and every payment. */
export function setMatchVoided(
  state: TournamentState,
  command: { matchId: string; isVoided: boolean; reason: string },
  context: CommandContext,
): CommandResult {
  const refusal = requireDesk(state, context);
  if (refusal) return refusal;
  const match = findCorrectable(state, command.matchId);
  if (!('slots' in match)) return match;
  if (match.isVoided === command.isVoided) {
    return refuse('wrong_status', command.isVoided ? 'This match is already voided.' : 'This match is not voided.');
  }
  const reason = cleanReason(command.reason);
  if (reason === null) return refuse('reason_required', 'Say why.');
  const next: Match = { ...match, isVoided: command.isVoided, version: match.version + 1 };
  const paid = repay(state, { next, context, reason });
  const event = eventOf(context, { kind: command.isVoided ? 'match_voided' : 'match_unvoided', matchId: match.id, reason });
  return accept(paid.state, [event, ...paid.conflicts]);
}

/** The desk moves a person into a seat (P-11's named exception), with the reason kept. */
export function reseat(
  state: TournamentState,
  command: { matchId: string; side: Side; entrantId: string; reason: string },
  context: CommandContext,
): CommandResult {
  const refusal = requireDesk(state, context);
  if (refusal) return refusal;
  const match = findMatchById(state, command.matchId);
  if (match === undefined) return refuse('not_found', 'No such match.');
  if (match.status !== 'scheduled') return refuse('wrong_status', 'Only a match that has not started can be re-seated.');
  const entrant = state.entrants.find((candidate) => candidate.id === command.entrantId);
  if (entrant === undefined || entrant.withdrawnAt !== null) return refuse('entrant_withdrawn', 'That team cannot take this seat.');
  const reason = cleanReason(command.reason);
  if (reason === null) return refuse('reason_required', 'Say why this seat changes.');
  const slot: Slot = { ...match.slots[command.side], seatedEntrantId: command.entrantId, seatOverrideReason: reason };
  const next: Match = { ...match, slots: { ...match.slots, [command.side]: slot }, version: match.version + 1 };
  const event = eventOf(context, { kind: 'reseated', matchId: match.id, reason, detail: { side: command.side, entrantId: entrant.id } });
  return accept(withMatch(state, next), [event]);
}
