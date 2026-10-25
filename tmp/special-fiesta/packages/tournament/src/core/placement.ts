import { accept, eventOf, findMatchById, isSuperadmin, refuse, refuseWhenClosed, withMatch } from './state.js';
import type { CommandContext, CommandResult, Match, TournamentState } from './types.js';

/**
 * ADR-278 — requirement 9: a person puts a match on a court at a time. The same act whether the
 * scheduler is running (it then keeps the placement as a pin) or terminated (it is then the only way
 * a match moves). A placement is a plan, not a start: the match is still `scheduled`.
 */

export interface PlaceMatchCommand {
  matchId: string;
  courtId: string;
  plannedStartAt: string;
}

export function placeMatch(state: TournamentState, command: PlaceMatchCommand, context: CommandContext): CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  if (!isSuperadmin(context.actor)) return refuse('not_allowed', 'Only a superadmin can move a match.');
  const match = findMatchById(state, command.matchId);
  if (match === undefined) return refuse('not_found', 'No such match.');
  if (match.status !== 'scheduled') return refuse('wrong_status', 'Only a match that has not started can be moved.');
  const court = state.courts.find((candidate) => candidate.id === command.courtId);
  if (court === undefined || !court.isEnabled) return refuse('court_unavailable', 'That court is not available.');
  const placed: Match = { ...match, courtId: court.id, plannedStartAt: command.plannedStartAt, version: match.version + 1 };
  const event = eventOf(context, { kind: 'match_placed', matchId: match.id, detail: { courtId: court.id, plannedStartAt: command.plannedStartAt } });
  return accept(withMatch(state, placed), [event]);
}

/**
 * ADR-329 F13 — a new match length for matches that have not started. The scheduler owns
 * which stages take which length; this command is the format-blind primitive it hands the
 * lengths to, so changing a length is an attributable core act (an event with an actor)
 * rather than a silent rewrite of core rows. Live and finished matches are never touched.
 */
export interface RetimeMatchesCommand {
  updates: readonly { matchId: string; minutes: number }[];
}

/** Every retime update must name a scheduled match and a whole length, 1–180; one bad one refuses all. */
function checkRetime(state: TournamentState, updates: RetimeMatchesCommand['updates']): CommandResult | null {
  if (updates.length === 0) return refuse('bad_step', 'Name at least one match to retime.');
  const byId = new Map(state.matches.map((match) => [match.id, match]));
  for (const update of updates) {
    if (!Number.isInteger(update.minutes) || update.minutes < 1 || update.minutes > 180) {
      return refuse('bad_step', 'A match length is a whole number of minutes, 1 to 180.');
    }
    const match = byId.get(update.matchId);
    if (match === undefined) return refuse('not_found', 'No such match.');
    if (match.status !== 'scheduled') return refuse('wrong_status', 'Only a match that has not started can be retimed.');
  }
  return null;
}

export function retimeMatches(state: TournamentState, command: RetimeMatchesCommand, context: CommandContext): CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  if (!isSuperadmin(context.actor) && context.actor.kind !== 'system') {
    return refuse('not_allowed', 'Only the desk or the scheduler can retime a match.');
  }
  const refused = checkRetime(state, command.updates);
  if (refused !== null) return refused;
  const minutesOf = new Map(command.updates.map((update) => [update.matchId, update.minutes]));
  const matches = state.matches.map((match) => {
    const minutes = minutesOf.get(match.id);
    return minutes === undefined || minutes === match.plannedMinutes
      ? match
      : { ...match, plannedMinutes: minutes, version: match.version + 1 };
  });
  const event = eventOf(context, {
    kind: 'matches_retimed',
    detail: { count: command.updates.length, minutes: command.updates[0]?.minutes ?? 0 },
  });
  return accept({ ...state, matches }, [event]);
}
