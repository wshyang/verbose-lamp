import { describe, expect, it } from "vitest";
import type { Stage, TournamentState } from "@psd/tournament/core";
import { deriveAwardTiers, tiersForSwitch } from "../tournament-mode/tiers.js";

/**
 * ADR-336 §4 — the award buttons a switched day starts with.
 *
 * The app decides the winning cluster by summing points, so the numbers on those buttons ARE the
 * scoring. They come from the day's own paid rates — `stage.rates ?? tournament.rates` — and never
 * from `tablePoints`, which rank teams inside a stage and are never paid to anybody (ADR-320).
 *
 * A stage that pays 3/1/0 for ranking and 30/20/10 for scoring must yield 30, 20 and 10.
 */

function stageOf(overrides: Partial<Stage> = {}): Stage {
  return {
    id: `s-${Math.random()}`,
    ordinal: 1,
    label: "Pool",
    kind: "pool",
    allowsDraws: true,
    advanceCount: 2,
    rates: null,
    tablePoints: null,
    intake: null,
    roster: [],
    status: "active",
    ...overrides,
  };
}

function day(
  stages: readonly Stage[],
  rates = { win: 30, draw: 20, loss: 10 },
): TournamentState {
  return {
    tournament: {
      id: "t1",
      name: "Day",
      status: "live",
      kind: "captains_ball",
      rates,
      closeReason: null,
      pausedAt: null,
    },
    entrants: [],
    stages,
    groups: [],
    matches: [],
    awards: [],
    courts: [],
  };
}

describe("ADR-336 — a tier is the day’s own paid rate", () => {
  it("inherits the tournament’s rates, deduped and descending, with the number as the label", () => {
    expect(deriveAwardTiers(day([stageOf()]))).toEqual([
      { label: "30 pts", points: 30 },
      { label: "20 pts", points: 20 },
      { label: "10 pts", points: 10 },
    ]);
  });

  it("never reads table points: a stage ranking on 3/1/0 still contributes only what it pays", () => {
    const ranked = stageOf({ tablePoints: { win: 3, draw: 1, loss: 0 } });
    expect(deriveAwardTiers(day([ranked])).map((tier) => tier.points)).toEqual([
      30, 20, 10,
    ]);
  });

  it("takes a stage’s own override, and drops its draw when that stage cannot draw", () => {
    const knockout = stageOf({
      kind: "bracket",
      allowsDraws: false,
      rates: { win: 50, draw: 20, loss: 20 },
    });
    // 50 from the win; 20 from its loss and its unused draw value, which dedupe to one button.
    expect(deriveAwardTiers(day([stageOf(), knockout]))).toEqual([
      { label: "50 pts", points: 50 },
      { label: "30 pts", points: 30 },
      { label: "20 pts", points: 20 },
      { label: "10 pts", points: 10 },
    ]);
  });

  it("a bracket-only day pays no draw at all when nothing allows one", () => {
    const bracket = stageOf({
      kind: "bracket",
      allowsDraws: false,
      rates: { win: 5, draw: 4, loss: 2 },
    });
    expect(deriveAwardTiers(day([bracket])).map((tier) => tier.points)).toEqual(
      [5, 2],
    );
  });

  it("never offers a zero button: a 0 award is never written and can never be awarded", () => {
    expect(
      deriveAwardTiers(day([stageOf()], { win: 3, draw: 1, loss: 0 })),
    ).toEqual([
      { label: "3 pts", points: 3 },
      { label: "1 pt", points: 1 },
    ]);
  });

  it("derives from the day as it is: a restaged stage’s rates are the ones that count", () => {
    // A restaged stage carries its own rates, so it replaces the tournament's rather than adding
    // to them — the buttons are what this day actually pays, not every rate it ever planned.
    const restaged = stageOf({ rates: { win: 12, draw: 6, loss: 6 } });
    expect(deriveAwardTiers(day([restaged]))).toEqual([
      { label: "12 pts", points: 12 },
      { label: "6 pts", points: 6 },
    ]);
  });

  it("does not truncate a derived set larger than the editor’s old four", () => {
    const wide = day([
      stageOf({ rates: { win: 50, draw: 40, loss: 30 } }),
      stageOf({ rates: { win: 45, draw: 35, loss: 25 } }),
      stageOf({ rates: { win: 20, draw: 15, loss: 10 } }),
    ]);
    expect(deriveAwardTiers(wide).map((tier) => tier.points)).toEqual([
      50, 45, 40, 35, 30, 25, 20, 15,
    ]);
  });

  it("falls back to the tournament’s rates when the day has no stages at all", () => {
    expect(deriveAwardTiers(day([])).map((tier) => tier.points)).toEqual([
      30, 20, 10,
    ]);
  });

  it("takes the desk’s edits when it made any, and the derivation when it left the form alone", () => {
    const state = day([stageOf()]);
    const edited = [{ label: "Champion", points: 100 }];
    expect(tiersForSwitch(state, edited)).toEqual(edited);
    expect(tiersForSwitch(state, undefined)).toEqual(deriveAwardTiers(state));
    expect(tiersForSwitch(state, [])).toEqual(deriveAwardTiers(state));
  });
});
