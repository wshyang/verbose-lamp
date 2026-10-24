import { cancelMatch, releaseMatch, stageAdHocMatch, startMatch } from './lifecycle.js';
import { occupantsOf } from './seats.js';
import { findMatchById, refuse } from './state.js';
import type { CommandContext, CommandResult, Match, TournamentState } from './types.js';

/**
 * ADR-277 — the court console's two buttons, as the engine sees them.
 *
 * The console names two teams and a court; it does not know whether the schedule owed that pair a
 * match. `startPair` decides: the queued match for the unordered pair is claimed (the one planned on
 * this court first, then the earliest), and only when there is none is an ad-hoc match staged —
 * allowed while the scheduler runs, by the owner's decision. `callOff` is the cancel button: a
 * claimed match goes back in the queue (the matchup is still owed), an ad-hoc one is cancelled.
 */

export interface StartPairCommand {
  courtId: string;
  entrantAId: string;
  entrantBId: string;
  /** Minutes an ad-hoc match is planned for; a claimed match keeps its own. */
  plannedMinutes: number;
}

function isPair(state: TournamentState, input: { match: Match; a: string; b: string }): boolean {
  const seats = occupantsOf(state, input.match);
  return (seats.a === input.a && seats.b === input.b) || (seats.a === input.b && seats.b === input.a);
}

/** The scheduled structure match this pair is owed, preferring one already planned on this court. */
export function queuedMatchFor(state: TournamentState, command: StartPairCommand): Match | undefined {
  const owed = state.matches
    .filter((match) => match.status === 'scheduled' && match.origin === 'structure')
    .filter((match) => isPair(state, { match, a: command.entrantAId, b: command.entrantBId }))
    .sort((left, right) => left.sequence - right.sequence);
  return owed.find((match) => match.courtId === command.courtId) ?? owed[0];
}

export function startPair(state: TournamentState, command: StartPairCommand, context: CommandContext): CommandResult {
  if (command.entrantAId === command.entrantBId) return refuse('same_entrant', 'Both seats name the same team.');
  const queued = queuedMatchFor(state, command);
  if (queued !== undefined) return startMatch(state, { matchId: queued.id, courtId: command.courtId }, context);
  return stageAdHocMatch(state, command, context);
}

/** The cancel button: back in the queue if the schedule owed it, cancelled if it was ad hoc. */
export function callOff(state: TournamentState, command: { matchId: string }, context: CommandContext): CommandResult {
  const match = findMatchById(state, command.matchId);
  if (match === undefined) return refuse('not_found', 'No such match.');
  if (match.status === 'in_progress' && match.origin === 'structure') return releaseMatch(state, command, context);
  if (match.status !== 'in_progress') return refuse('wrong_status', 'Only a live match can be called off.');
  return cancelMatch(state, { matchId: match.id, reason: null }, context);
}
