import { stageStandings, type Stage, type TournamentState } from '../../core/index.js';
import type { DraftMatch, FormatPlugin, SeededEntrant, Structure } from '../types.js';
import { between } from './basic.js';
import { entrantSeat, stageOf } from './common.js';

/**
 * ADR-274 — Swiss: the one format whose next round cannot be known in advance (§6 of the problem
 * catalogue). Round 1 pairs the seeds 1 v 2, 3 v 4; every later round is paired from the standings
 * once the round before it is finished, never pairing two teams who have already met. An odd field
 * gives the lowest-ranked team that has not had one a bye, recorded by the adapter as a bye win.
 */

export function defaultSwissRounds(teamCount: number): number {
  return Math.max(1, Math.ceil(Math.log2(teamCount)));
}

function firstRound(entrants: readonly SeededEntrant[]): DraftMatch[] {
  const matches: DraftMatch[] = [];
  for (let index = 0; index + 1 < entrants.length; index += 2) {
    matches.push({
      code: `S1-${index / 2 + 1}`,
      stageCode: 'SW',
      groupCode: null,
      round: 1,
      sequence: index / 2 + 1,
      isPlacement: false,
      a: entrantSeat(entrants[index] as SeededEntrant),
      b: entrantSeat(entrants[index + 1] as SeededEntrant),
    });
  }
  return matches;
}

function validateSwiss(teamCount: number, options: { rounds?: number }): string | null {
  const bounds = between(teamCount, { min: 4, max: 32 });
  if (bounds) return bounds;
  const rounds = options.rounds ?? defaultSwissRounds(teamCount);
  if (rounds < 1 || rounds > teamCount - 1) return `Swiss needs between 1 and ${teamCount - 1} rounds for ${teamCount} teams.`;
  return null;
}

export const swissFormat: FormatPlugin = {
  id: 'swiss',
  label: 'Swiss rounds',
  summary: 'Each round pairs teams on the same record; nobody plays the same team twice.',
  minTeams: 4,
  maxTeams: 32,
  validate: validateSwiss,
  build: (entrants, options): Structure => ({
    stages: [stageOf({ code: 'SW', ordinal: 1, label: 'Swiss', kind: 'swiss', tablePoints: options.tablePoints ?? null })],
    groups: [],
    matches: firstRound(entrants),
  }),
  restPolicy: { restMinutes: null, flagBackToBack: false },
  isDynamic: true,
};

export function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

/** Pairs already played in a stage, as unordered keys. */
function playedPairs(state: TournamentState, stage: Stage): Set<string> {
  const pairs = new Set<string>();
  for (const match of state.matches) {
    const a = match.slots.a.seatedEntrantId;
    const b = match.slots.b.seatedEntrantId;
    if (match.stageId === stage.id && a !== null && b !== null) pairs.add(pairKey(a, b));
  }
  return pairs;
}

/** Who has already sat a round out, so the bye goes round the field instead of to the same team. */
function hadBye(state: TournamentState, stage: Stage): Set<string> {
  const ids = new Set<string>();
  for (const match of state.matches) {
    if (match.stageId !== stage.id || match.result?.kind !== 'bye') continue;
    const winner = match.result.winnerSide === 'a' ? match.slots.a.seatedEntrantId : match.slots.b.seatedEntrantId;
    if (winner !== null) ids.add(winner);
  }
  return ids;
}

/**
 * ADR-324 — the most pairings the search will try before it gives up. A field with no rematch-free
 * pairing is only discovered at the bottom of each branch, so an exhaustive search of 20 teams
 * visits 19!! = 654,729,075 of them: measured at 44 seconds of synchronous work, inside a database
 * transaction, which stops the whole process. Real fields find a pairing within a few hundred tries
 * (the greedy first choice almost always works), so this is generous for them and a hard ceiling
 * for the pathological case, where the caller already has a fallback: a rematch beats no round.
 */
export const PAIRING_STEP_BUDGET = 20_000;

interface PairingSearch {
  played: ReadonlySet<string>;
  steps: number;
}

function pairFrom(ranked: readonly string[], search: PairingSearch): [string, string][] | null {
  if (ranked.length === 0) return [];
  const [first, ...rest] = ranked as [string, ...string[]];
  for (let index = 0; index < rest.length; index += 1) {
    if (search.steps >= PAIRING_STEP_BUDGET) return null;
    const partner = rest[index] as string;
    if (search.played.has(pairKey(first, partner))) continue;
    search.steps += 1;
    const tail = pairFrom([...rest.slice(0, index), ...rest.slice(index + 1)], search);
    if (tail !== null) return [[first, partner], ...tail];
  }
  return null;
}

/**
 * Pairing down the standings with backtracking: each team takes the highest-ranked team below it
 * that it has not met. Backtracking keeps the rule at the bottom of the table, where a greedy pass
 * alone can paint itself into a rematch. Returns null when no rematch-free pairing exists, or when
 * the search runs out of its step budget (PAIRING_STEP_BUDGET) — which the caller treats the same.
 */
export function pairWithoutRematch(ranked: readonly string[], played: ReadonlySet<string>): [string, string][] | null {
  return pairFrom(ranked, { played, steps: 0 });
}

export interface SwissRoundPlan {
  round: number;
  pairs: [string, string][];
  byeEntrantId: string | null;
}

function chooseBye(ranked: readonly string[], byes: ReadonlySet<string>): string | null {
  if (ranked.length % 2 === 0) return null;
  const fromBottom = [...ranked].reverse();
  return fromBottom.find((id) => !byes.has(id)) ?? fromBottom[0] ?? null;
}

function rankedField(state: TournamentState, stage: Stage): string[] {
  const active = new Set(state.entrants.filter((entrant) => entrant.withdrawnAt === null).map((entrant) => entrant.id));
  const standing = stageStandings(state, stage)
    .map((row) => row.entrantId)
    .filter((id) => active.has(id));
  const unplaced = state.entrants
    .filter((entrant) => active.has(entrant.id) && !standing.includes(entrant.id))
    .map((entrant) => entrant.id);
  return [...standing, ...unplaced];
}

/** The next Swiss round, or null while a round is still being played or when all rounds are done. */
export function planNextSwissRound(state: TournamentState, input: { stage: Stage; rounds: number }): SwissRoundPlan | null {
  const own = state.matches.filter((match) => match.stageId === input.stage.id);
  const lastRound = own.reduce((highest, match) => Math.max(highest, match.round), 0);
  if (lastRound >= input.rounds) return null;
  const isRoundOpen = own.some((match) => match.round === lastRound && (match.status === 'scheduled' || match.status === 'in_progress'));
  if (isRoundOpen) return null;
  const ranked = rankedField(state, input.stage);
  const byeEntrantId = chooseBye(ranked, hadBye(state, input.stage));
  const field = ranked.filter((id) => id !== byeEntrantId);
  // When the field is too small to avoid every rematch, a rematch beats no round at all.
  const pairs = pairWithoutRematch(field, playedPairs(state, input.stage)) ?? pairWithoutRematch(field, new Set()) ?? [];
  return { round: lastRound + 1, pairs, byeEntrantId };
}
