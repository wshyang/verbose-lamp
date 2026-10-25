import { cleanReason, eventOf, refuse, accept, refuseWhenClosed, takeId } from './state.js';
import type {
  Award,
  CommandContext,
  CommandResult,
  Match,
  PointRates,
  Side,
  TournamentEvent,
  TournamentState,
} from './types.js';

/**
 * ADR-273 §3 — active-day points, as an append-and-void ledger of awards to entrants.
 *
 * The core only knows entrants: who on a team is paid is the app's business, frozen by the roster
 * bridge when an award is written (ADR-275). A result award is written when a match is completed and
 * voided — never edited — when the result is corrected or voided, so the ledger always says what was
 * paid and when it stopped being paid.
 */

/** Same bound as a score adjustment and a team award (ADR-117, ADR-248): non-zero, ±100. */
export const AWARD_POINTS_LIMIT = 100;

export function ratesForMatch(state: TournamentState, match: Match): PointRates {
  const stage = state.stages.find((candidate) => candidate.id === match.stageId);
  return stage?.rates ?? state.tournament.rates;
}

function pointsFor(rates: PointRates, input: { winnerSide: Side | null; side: Side }): number {
  if (input.winnerSide === null) return rates.draw;
  return input.winnerSide === input.side ? rates.win : rates.loss;
}

/** The result awards a finished match pays, one per seated side; zero-point awards are not written. */
export function resultAwardsFor(
  state: TournamentState,
  input: { match: Match; context: CommandContext; firstIdIndex: number },
): Award[] {
  const { match, context } = input;
  if (match.result === null || match.isVoided) return [];
  const rates = ratesForMatch(state, match);
  const awards: Award[] = [];
  for (const side of ['a', 'b'] as const) {
    const entrantId = match.slots[side].seatedEntrantId;
    const points = pointsFor(rates, { winnerSide: match.result.winnerSide, side });
    if (entrantId === null || points === 0) continue;
    awards.push({
      id: takeId(context, input.firstIdIndex + awards.length),
      entrantId,
      matchId: match.id,
      kind: 'result',
      points,
      reason: `Match ${match.code}`,
      createdAt: context.now,
      voidedAt: null,
    });
  }
  return awards;
}

/** Every live result award of a match, voided at `now`. */
export function voidResultAwards(state: TournamentState, input: { matchId: string; now: string }): Award[] {
  return state.awards.map((award) =>
    award.matchId === input.matchId && award.kind === 'result' && award.voidedAt === null
      ? { ...award, voidedAt: input.now }
      : award,
  );
}

export interface AwardPointsCommand {
  entrantId: string;
  points: number;
  reason: string;
}

function isAwardable(points: number): boolean {
  return Number.isInteger(points) && points !== 0 && Math.abs(points) <= AWARD_POINTS_LIMIT;
}

/** ADR-321 — in dumb mode awarding points at the court is the whole game, so court masters may award too. */
function mayAward(state: TournamentState, context: CommandContext): boolean {
  return context.actor.kind !== 'facilitator' || state.tournament.kind === 'dumb_courts';
}

/** A superadmin's manual award to a team (requirement 6): signed, bounded, explained. */
export function awardPoints(
  state: TournamentState,
  command: AwardPointsCommand,
  context: CommandContext,
): CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  if (!mayAward(state, context)) return refuse('not_allowed', 'Only a superadmin can award points.');
  if (!state.entrants.some((entrant) => entrant.id === command.entrantId)) {
    return refuse('not_found', 'No such entrant in this tournament.');
  }
  if (!isAwardable(command.points)) {
    return refuse('points_invalid', 'Points must be a whole number between -100 and 100, not 0.');
  }
  const reason = cleanReason(command.reason);
  if (reason === null) return refuse('reason_required', 'Say why these points are awarded.');
  const award: Award = {
    id: takeId(context, 0),
    entrantId: command.entrantId,
    matchId: null,
    kind: 'manual',
    points: command.points,
    reason,
    createdAt: context.now,
    voidedAt: null,
  };
  const event = eventOf(context, { kind: 'award_granted', reason, detail: { awardId: award.id, points: award.points } });
  return accept({ ...state, awards: [...state.awards, award] }, [event]);
}

/** Taking a manual award back. Result awards follow their match and are never voided by hand. */
export function voidAward(
  state: TournamentState,
  command: { awardId: string; reason: string },
  context: CommandContext,
): CommandResult {
  if (!mayAward(state, context)) return refuse('not_allowed', 'Only a superadmin can void points.');
  const award = state.awards.find((candidate) => candidate.id === command.awardId);
  if (award === undefined || award.kind !== 'manual') return refuse('not_found', 'No such manual award.');
  if (award.voidedAt !== null) return refuse('wrong_status', 'That award is already voided.');
  const reason = cleanReason(command.reason);
  if (reason === null) return refuse('reason_required', 'Say why these points are taken back.');
  const awards = state.awards.map((row) => (row.id === award.id ? { ...row, voidedAt: context.now } : row));
  const event: TournamentEvent = eventOf(context, { kind: 'award_voided', reason, detail: { awardId: award.id } });
  return accept({ ...state, awards }, [event]);
}

/** The live (unvoided) total each entrant has been paid by this tournament. */
export function awardTotals(state: TournamentState): Map<string, number> {
  const totals = new Map<string, number>();
  for (const award of state.awards) {
    if (award.voidedAt !== null) continue;
    totals.set(award.entrantId, (totals.get(award.entrantId) ?? 0) + award.points);
  }
  return totals;
}
