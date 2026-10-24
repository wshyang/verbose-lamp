import type { MatchStage } from './wire.js';

/**
 * ADR-157 — what a score means, in one place.
 *
 * ADR-114 made the score the result and ADR-152 made a level score a legal one. That rule
 * then grew three copies: the completion route enforced it, the court console rendered it,
 * and the correction desk ignored it entirely — a superadmin could record a winner the
 * scoreboard disagreed with, and nothing downstream could tell which of the two was true.
 *
 * The organiser's ruling (2026-10-04) is that the desk and the court are the same surface:
 * if two teams have the same score it is a draw, whoever is typing. One rule cannot live in
 * three files, so it lives here, in the package both sides already depend on.
 */

/**
 * A knockout or third-place fixture must produce a winner: the bracket advances exactly one
 * team, so a drawn one has no representable outcome. ADR-137 made third place its own stage
 * rather than a flagged knockout, which is why this tests the capability and not
 * `=== 'knockout'` — the narrower test quietly lets the play-off end level.
 *
 * A null stage is a match played off the schedule (ADR-089): it pays participant points but
 * reaches no group table, so letting it draw costs nothing.
 */
export function stageCanDraw(stage: MatchStage | null): boolean {
  return stage !== 'knockout' && stage !== 'third_place';
}

/**
 * How a match on this score may end.
 *
 * - `win` — somebody leads, and `winnerTeamId` is that team. Nobody chooses this.
 * - `draw` — level, where level is allowed to mean drawn. Including 0 - 0 (ADR-152).
 * - `overtime` — level in a bracket, with points on the board: golden point, play on.
 * - `untracked` — 0 - 0 in a bracket. The score names nobody and a draw is illegal, so a
 *   human must name the winner. The only case where a person still gets to decide.
 */
/** ADR-329 F5 — how a level knockout was settled off the scoreboard. */
export type TiebreakMethod = 'coin_toss' | 'rock_paper_scissors';

export type MatchOutcomeMode = 'win' | 'draw' | 'overtime' | 'untracked';

export interface MatchOutcome {
  mode: MatchOutcomeMode;
  /** The team the SCORE says won, or null when the score names nobody. */
  winnerTeamId: string | null;
}

export function readMatchOutcome(input: {
  scoreA: number;
  scoreB: number;
  teamAId: string;
  teamBId: string;
  stage: MatchStage | null;
}): MatchOutcome {
  if (input.scoreA !== input.scoreB) {
    return {
      mode: 'win',
      winnerTeamId: input.scoreA > input.scoreB ? input.teamAId : input.teamBId,
    };
  }
  if (stageCanDraw(input.stage)) return { mode: 'draw', winnerTeamId: null };
  return { mode: input.scoreA === 0 ? 'untracked' : 'overtime', winnerTeamId: null };
}
