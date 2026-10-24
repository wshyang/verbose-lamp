import { messages, stageCanDraw } from '@psd/contracts';
import type { MatchStage } from '@psd/contracts';
import { badRequest } from './http.js';

/**
 * ADR-114, as amended by ADR-152 — once a score exists it decides the match, and the two may
 * not disagree. What ADR-152 changed is that a level score is now an answer rather than an
 * absence.
 *
 * Where a draw is legal, level means DRAWN — including 0 - 0. That retires the old
 * untracked-winner path for group matches: a marshal who never touched the strip can no
 * longer name the winner, and must record a point instead. The trade is accepted
 * deliberately, because the alternative is accepting a winner for which no evidence was
 * ever entered.
 *
 * Where a draw is NOT legal the old exception survives, and must: a knockout match on 0 - 0
 * that could neither be drawn nor decided by hand could never be closed at all, and the
 * bracket would deadlock. Any other level score there plays on into overtime.
 *
 * ADR-157 moved this out of the completion route, unchanged. It had been the court's private
 * rule, and the correction desk enforced nothing at all — so the two doors into the same
 * table disagreed about what a score meant, and the desk's door was the one that could write
 * a winner the scoreboard contradicted. One rule, both doors; the only way to be sure of
 * that is for there to be one function.
 *
 * ADR-277 — restored unchanged for the rebuilt tournament's court console and correction desk. The
 * wire's `null` winner is a DECLARED draw, which the engine's command cannot express (its `null`
 * means "read it off the score"), so the edge keeps this rule and the engine only ever sees a claim
 * that already agrees with the score.
 */
export type TiebreakMethod = 'coin_toss' | 'rock_paper_scissors';

/** The level-score branch: a draw where draws live, the 0 - 0 hatch, or a tiebreak (ADR-329 F5). */
function checkLevelWinner(
  match: { scoreA: number; teamAId: string; teamBId: string },
  winnerTeamId: string,
  rule: { canDraw: boolean; tiebreakMethod: TiebreakMethod | null },
): void {
  if (rule.canDraw) {
    if (rule.tiebreakMethod !== null) throw badRequest(messages.tiebreakNotNeeded);
    throw badRequest(messages.levelScoreIsADraw);
  }
  // The knockout 0 - 0 escape hatch: untracked, so the human names the winner.
  if (match.scoreA === 0) return;
  // Level with points on the board settles by toss or scissors-paper-stone; the score stays as played.
  if (rule.tiebreakMethod !== null) {
    if (winnerTeamId !== match.teamAId && winnerTeamId !== match.teamBId) throw badRequest(messages.winnerMustMatchScore);
    return;
  }
  throw badRequest(messages.knockoutPlaysOn);
}

export function assertResultMatchesScore(
  match: { scoreA: number; scoreB: number; teamAId: string; teamBId: string },
  winnerTeamId: string | null,
  rule: { stage: MatchStage | null; tiebreakMethod?: TiebreakMethod | null },
): void {
  const canDraw = stageCanDraw(rule.stage);
  const tiebreakMethod = rule.tiebreakMethod ?? null;
  const isLevel = match.scoreA === match.scoreB;
  if (winnerTeamId === null) {
    if (!isLevel) throw badRequest(messages.drawNeedsLevelScore);
    if (!canDraw) throw badRequest(messages.knockoutCannotDraw);
    return;
  }
  if (isLevel) {
    checkLevelWinner(match, winnerTeamId, { canDraw, tiebreakMethod });
    return;
  }
  if (tiebreakMethod !== null) throw badRequest(messages.tiebreakNotNeeded);
  const leader = match.scoreA > match.scoreB ? match.teamAId : match.teamBId;
  if (winnerTeamId !== leader) throw badRequest(messages.winnerMustMatchScore);
}
