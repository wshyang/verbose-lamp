import { pointsLabel, type AwardTier } from "@psd/contracts";
import type { TournamentState } from "@psd/tournament/core";

/**
 * ADR-336 §4 — the buttons a switched day starts with, derived from the day it replaced.
 *
 * Dumb mode has no matches, stages or wins, so a tier is a PRESS SURFACE: the facilitator picks the
 * number of points they would have awarded, and the app pays the team. The numbers must therefore be
 * exactly the ones the fixture day would have paid — not a contingency vocabulary invented in
 * advance, and not the stage's internal table points, which rank and are never paid (ADR-320).
 *
 * The day already states every award it could have made: each stage carries its paid rates, and a
 * stage without its own inherits the tournament's. That is the same resolution `ratesForMatch` makes
 * when a result is paid, so a derived button can never disagree with the result it stands in for.
 *
 * The rules, in order:
 *  1. every stage's paid rates: `stage.rates ?? tournament.rates`;
 *  2. drop a stage's DRAW value when it does not allow draws — that award cannot happen there;
 *  3. drop 0 — a zero-point award is never written by a result and can never be awarded by hand, so
 *     a 0 button could only refuse;
 *  4. dedupe by VALUE, not by source: the same number arrives from different stage/result pairs;
 *  5. sort descending, so the biggest award is the first button under the thumb;
 *  6. label is the number, because one value stands for several sources and the room is not reading
 *     provenance at 14:20. A label that is exactly `pointsLabel(points)` is what tells a press
 *     surface it need not print the number twice.
 */
export function deriveAwardTiers(state: TournamentState): AwardTier[] {
  const values = new Set<number>();
  for (const stage of state.stages) {
    const rates = stage.rates ?? state.tournament.rates;
    values.add(rates.win);
    values.add(rates.loss);
    if (stage.allowsDraws) values.add(rates.draw);
  }
  // A day with no stages yet (a bracket that was never built) still has the tournament's own rates.
  if (state.stages.length === 0) {
    const rates = state.tournament.rates;
    values.add(rates.win);
    values.add(rates.draw);
    values.add(rates.loss);
  }
  return [...values]
    .filter((points) => points !== 0)
    .sort((left, right) => right - left)
    .slice(0, 8)
    .map((points) => ({ label: pointsLabel(points), points }));
}

/**
 * The set the desk actually gets: what it typed if it typed anything, otherwise the derivation.
 *
 * The switch form opens prefilled with `deriveAwardTiers` and the desk may correct it before
 * confirming — the situation at 14:20 may differ from what the day planned in July. What is
 * committed is snapshotted onto the mode row, so later edits rewrite no history.
 */
export function tiersForSwitch(
  state: TournamentState,
  chosen: readonly AwardTier[] | undefined,
): AwardTier[] {
  return chosen === undefined || chosen.length === 0
    ? deriveAwardTiers(state)
    : [...chosen];
}
