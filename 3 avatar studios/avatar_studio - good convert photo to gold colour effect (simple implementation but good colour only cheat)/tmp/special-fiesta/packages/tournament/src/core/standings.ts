import type { Entrant, Group, Match, Side, Stage, TournamentState } from './types.js';

/**
 * ADR-273 §4 — one ranking rule for every table (P-10): table points, then score
 * difference, then points scored, then entry order. Entry order is the visibly arbitrary last step,
 * so a tie it separates is called arbitrary in the explanation rather than dressed up as merit.
 *
 * ADR-320 — table points are a stage's INTERNAL scoring: definable per stage (`Stage.tablePoints`),
 * defaulting to 3 / 1 / 0. They rank; they are not what anybody is paid. The day's active-day
 * points are the stage's rates, written as awards (`awards.ts`) — a separate number, on purpose.
 */

export const DEFAULT_TABLE_POINTS = { win: 3, draw: 1, loss: 0 } as const;

/** The table points a stage ranks by: its own when set, else the default 3/1/0. */
export function tablePointsOf(stage: Stage): { win: number; draw: number; loss: number } {
  return stage.tablePoints ?? DEFAULT_TABLE_POINTS;
}

export interface StandingRow {
  entrantId: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  conceded: number;
  difference: number;
  points: number;
  rank: number;
  explanation: string;
}

interface Tally {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  conceded: number;
}

const EMPTY: Tally = { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0 };

/** A match that counts towards a table: finished, not voided, and with a result. */
export function countsForTable(match: Match): boolean {
  return match.status === 'completed' && !match.isVoided && match.result !== null;
}

/** The entrant actually sitting on a side of a match. */
export function seatedOn(match: Match, side: Side): string | null {
  return match.slots[side].seatedEntrantId;
}

function outcomeFor(match: Match, side: Side): 'win' | 'draw' | 'loss' {
  const winner = match.result?.winnerSide ?? null;
  if (winner === null) return 'draw';
  return winner === side ? 'win' : 'loss';
}

function addResult(tally: Tally, input: { match: Match; side: Side }): Tally {
  const { match, side } = input;
  const outcome = outcomeFor(match, side);
  // A walkover or bye is a win with no score: it moves the record, never the difference.
  const isScored = match.result?.kind === 'score';
  const own = side === 'a' ? match.scoreA : match.scoreB;
  const other = side === 'a' ? match.scoreB : match.scoreA;
  return {
    played: tally.played + 1,
    wins: tally.wins + (outcome === 'win' ? 1 : 0),
    draws: tally.draws + (outcome === 'draw' ? 1 : 0),
    losses: tally.losses + (outcome === 'loss' ? 1 : 0),
    scored: tally.scored + (isScored ? own : 0),
    conceded: tally.conceded + (isScored ? other : 0),
  };
}

function tallies(entrantIds: readonly string[], matches: readonly Match[]): Map<string, Tally> {
  const ids = new Set(entrantIds);
  const table = new Map<string, Tally>(entrantIds.map((id) => [id, EMPTY]));
  for (const match of matches.filter(countsForTable)) {
    for (const side of ['a', 'b'] as const) {
      const entrantId = seatedOn(match, side);
      if (entrantId === null || !ids.has(entrantId)) continue;
      table.set(entrantId, addResult(table.get(entrantId) ?? EMPTY, { match, side }));
    }
  }
  return table;
}

function pointsOf(tally: Tally, tablePoints: { win: number; draw: number; loss: number }): number {
  return tally.wins * tablePoints.win + tally.draws * tablePoints.draw + tally.losses * tablePoints.loss;
}

interface Ranked {
  entrant: Entrant;
  tally: Tally;
  points: number;
}

function differenceOf(row: Ranked): number {
  return row.tally.scored - row.tally.conceded;
}

function compareRanked(left: Ranked, right: Ranked): number {
  if (left.points !== right.points) return right.points - left.points;
  if (differenceOf(left) !== differenceOf(right)) return differenceOf(right) - differenceOf(left);
  if (left.tally.scored !== right.tally.scored) return right.tally.scored - left.tally.scored;
  return left.entrant.entryOrder - right.entrant.entryOrder;
}

/** The one sentence a losing captain is owed: what separated this row from the one above it. */
function explain(row: Ranked, above: Ranked | undefined): string {
  const points = `${row.points} pt${row.points === 1 ? '' : 's'}`;
  if (above === undefined) return `Top on ${points}.`;
  if (above.points !== row.points) return `${points}, behind ${above.entrant.name} on points.`;
  if (differenceOf(above) !== differenceOf(row)) {
    return `Level on ${points} with ${above.entrant.name}; behind on score difference.`;
  }
  if (above.tally.scored !== row.tally.scored) {
    return `Level on ${points} and difference with ${above.entrant.name}; fewer points scored.`;
  }
  return `Level on everything with ${above.entrant.name}; placed by entry order, which is arbitrary.`;
}

/** Ranks the given entrants over the given matches. Pure; the same input always ranks the same. */
export function rankEntrants(input: {
  entrants: readonly Entrant[];
  matches: readonly Match[];
  /** The internal scoring the ranking runs on; the default 3/1/0 when a stage sets none. */
  tablePoints?: { win: number; draw: number; loss: number } | null | undefined;
}): StandingRow[] {
  const table = tallies(
    input.entrants.map((entrant) => entrant.id),
    input.matches,
  );
  const tablePoints = input.tablePoints ?? DEFAULT_TABLE_POINTS;
  const ranked: Ranked[] = input.entrants
    .map((entrant) => {
      const tally = table.get(entrant.id) ?? EMPTY;
      return { entrant, tally, points: pointsOf(tally, tablePoints) };
    })
    .sort(compareRanked);
  return ranked.map((row, index) => ({
    entrantId: row.entrant.id,
    name: row.entrant.name,
    ...row.tally,
    difference: differenceOf(row),
    points: row.points,
    rank: index + 1,
    explanation: explain(row, ranked[index - 1]),
  }));
}

function entrantsById(state: TournamentState, ids: readonly string[]): Entrant[] {
  const byId = new Map(state.entrants.map((entrant) => [entrant.id, entrant]));
  return ids.flatMap((id) => {
    const entrant = byId.get(id);
    return entrant === undefined ? [] : [entrant];
  });
}

/** A group's table: its own entrants, its own matches, its stage's internal scoring. */
export function groupStandings(state: TournamentState, group: Group): StandingRow[] {
  const stage = state.stages.find((candidate) => candidate.id === group.stageId);
  return rankEntrants({
    entrants: entrantsById(state, group.entrantIds),
    matches: state.matches.filter((match) => match.groupId === group.id),
    tablePoints: stage?.tablePoints ?? null,
  });
}

/** Whether every match in a group is finished — nothing is decided until everything is in (P-11). */
export function isGroupDecided(state: TournamentState, group: Group): boolean {
  const own = state.matches.filter((match) => match.groupId === group.id);
  return own.every((match) => match.status === 'completed' || match.status === 'cancelled');
}

/** Everybody who played in a stage, ranked over that stage's matches (Swiss, open play). */
export function stageStandings(state: TournamentState, stage: Stage): StandingRow[] {
  const matches = state.matches.filter((match) => match.stageId === stage.id);
  const ids = new Set<string>();
  for (const match of matches) {
    for (const side of ['a', 'b'] as const) {
      const seated = seatedOn(match, side);
      if (seated !== null) ids.add(seated);
    }
  }
  const entrants = state.entrants.filter((entrant) => ids.has(entrant.id));
  return rankEntrants({ entrants, matches, tablePoints: stage.tablePoints });
}

/**
 * One finishing place of a stage's groups, ranked against itself on group records — the
 * runners-up of every group compared as one field. A group that is not decided contributes
 * nobody yet: a place is not a place until everything in the group is in (P-11).
 */
export function groupPlacesRanked(state: TournamentState, stage: Stage, place: number): StandingRow[] {
  const groups = state.groups.filter((group) => group.stageId === stage.id);
  const placedIds: string[] = [];
  for (const group of groups) {
    if (!isGroupDecided(state, group)) continue;
    const row = groupStandings(state, group)[place - 1];
    if (row !== undefined) placedIds.push(row.entrantId);
  }
  const groupIds = new Set(groups.map((group) => group.id));
  return rankEntrants({
    entrants: entrantsById(state, placedIds),
    matches: state.matches.filter((match) => match.groupId !== null && groupIds.has(match.groupId)),
  });
}

/**
 * The winners of a stage's groups, ranked against each other on their own group records — the
 * points rush "overall leaderboard". A group that is not decided contributes nobody yet.
 */
export function groupWinnersRanked(state: TournamentState, stage: Stage): StandingRow[] {
  return groupPlacesRanked(state, stage, 1);
}

/**
 * ADR-320 — how many teams the next stage actually takes from this one: the highest
 * `stage_place` any downstream seat reads. A bracket fed four advancers reads places
 * 1–4, so its intake is 4 even when the groups only guarantee three group winners —
 * the fourth seat is a shortfall fill, and its cut line is a cut line too.
 */
export function downstreamIntake(state: TournamentState, stage: Stage): number {
  // ADR-325 — a stage with no fixtures (open play) declares its intake instead of implying it by seats.
  let intake = state.stages.reduce((most, other) => (other.intake?.fromStageId === stage.id ? Math.max(most, other.intake.count) : most), 0);
  for (const match of state.matches) {
    if (match.stageId === stage.id) continue;
    for (const side of ['a', 'b'] as const) {
      const { source } = match.slots[side];
      if (source.kind === 'stage_place' && source.stageId === stage.id) intake = Math.max(intake, source.place);
    }
  }
  return intake;
}

export interface AdvancerPlace {
  row: StandingRow;
  /** 1-based place in advancer order. */
  place: number;
  /**
   * How this team got its seat: a per-group qualifier (inside its own group's
   * `advanceCount`), or a shortfall fill — a non-qualifier taken, in internal-table
   * order, because the next stage needed more teams than the groups qualified.
   */
  via: 'qualifier' | 'fill';
}

/**
 * ADR-320 — the reconciled handover, named: the teams the next stage takes from this
 * one, qualifiers first and shortfall fills after, each labelled with how it got
 * there. The count is the downstream intake when a later stage reads places from
 * this one; otherwise the stage's own qualifying count (per-group qualifiers for a
 * grouped stage, `advanceCount` for a plain table). Never more than the field.
 */
export function stageAdvancers(state: TournamentState, stage: Stage, count?: number): AdvancerPlace[] {
  const groups = state.groups.filter((group) => group.stageId === stage.id);
  const ranked = groups.length > 0 ? advancersRanked(state, stage) : stageStandings(state, stage);
  const fallback = groups.length > 0 ? groups.length * stage.advanceCount : stage.advanceCount;
  const wanted = Math.min(count ?? (downstreamIntake(state, stage) || fallback), ranked.length);
  const groupPlace = new Map<string, number>();
  for (const group of groups) {
    groupStandings(state, group).forEach((row, index) => groupPlace.set(row.entrantId, index + 1));
  }
  return ranked.slice(0, wanted).map((row, index) => {
    const placeInGroup = groupPlace.get(row.entrantId);
    const isQualifier = groups.length > 0 ? (placeInGroup ?? Infinity) <= stage.advanceCount : index < stage.advanceCount;
    return { row, place: index + 1, via: isQualifier ? ('qualifier' as const) : ('fill' as const) };
  });
}

/**
 * ADR-310 — every group finisher in advancer order: place-major, then the one ranking
 * rule (points, difference, scored, entry order) inside each place class. All of a
 * stage's group winners, ranked, then all its runners-up, ranked, and so on — so
 * "the top four go through" from three groups means the three winners and the best
 * runner-up, and a runner-up can never jump a winner on points alone. This is the
 * order `stage_place` seats read on a grouped stage.
 */
export function advancersRanked(state: TournamentState, stage: Stage): StandingRow[] {
  const groups = state.groups.filter((group) => group.stageId === stage.id);
  const deepest = Math.max(0, ...groups.map((group) => group.entrantIds.length));
  const ranked: StandingRow[] = [];
  for (let place = 1; place <= deepest; place += 1) {
    ranked.push(...groupPlacesRanked(state, stage, place));
  }
  return ranked;
}
