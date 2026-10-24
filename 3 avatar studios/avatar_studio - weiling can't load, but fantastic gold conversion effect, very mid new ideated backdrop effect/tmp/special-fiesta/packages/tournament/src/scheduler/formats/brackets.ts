import type { DraftMatch, DraftSlot, FormatPlugin, SeededEntrant, Structure } from '../types.js';
import { between } from './basic.js';
import { bracketOrder, entrantSeat, isPowerOfTwo, loserSeat, stageOf, winnerSeat } from './common.js';

/**
 * ADR-274 — the fixed brackets with a second life: double elimination and the 8-team consolation
 * bracket. Both are wired entirely from winner/loser seats, which is the core's requirement 10.
 *
 * The builder below appends to an array it created itself; nothing it was handed is changed.
 */

const NO_REST_RULE = { restMinutes: null, flagBackToBack: false } as const;

interface Builder {
  matches: DraftMatch[];
}

interface MatchSpec {
  code: string;
  stageCode: string;
  round: number;
  a: DraftSlot;
  b: DraftSlot;
  isPlacement?: boolean;
}

function add(builder: Builder, spec: MatchSpec): string {
  builder.matches.push({
    code: spec.code,
    stageCode: spec.stageCode,
    groupCode: null,
    round: spec.round,
    sequence: builder.matches.length + 1,
    isPlacement: spec.isPlacement ?? false,
    a: spec.a,
    b: spec.b,
  });
  return spec.code;
}

function seatAt(seats: readonly DraftSlot[], index: number): DraftSlot {
  return seats[index] ?? { source: { kind: 'vacant' }, label: 'Bye' };
}

/** Winners bracket rounds; returns the codes of each round so the losers bracket can read them. */
function winnersBracket(builder: Builder, entrants: readonly SeededEntrant[]): string[][] {
  let seats: DraftSlot[] = bracketOrder(entrants.length, 'classic').map((seed) => entrantSeat(entrants[seed - 1] as SeededEntrant));
  const rounds: string[][] = [];
  for (let round = 1; seats.length > 1; round += 1) {
    const codes: string[] = [];
    for (let index = 0; index < seats.length; index += 2) {
      codes.push(add(builder, { code: `W${round}-${index / 2 + 1}`, stageCode: 'DE', round, a: seatAt(seats, index), b: seatAt(seats, index + 1) }));
    }
    rounds.push(codes);
    seats = codes.map((code) => winnerSeat(code));
  }
  return rounds;
}

function pairUp(builder: Builder, input: { seats: readonly DraftSlot[]; round: number }): DraftSlot[] {
  const next: DraftSlot[] = [];
  for (let index = 0; index < input.seats.length; index += 2) {
    const code = add(builder, {
      code: `L${input.round}-${index / 2 + 1}`,
      stageCode: 'DE',
      round: 100 + input.round,
      a: seatAt(input.seats, index),
      b: seatAt(input.seats, index + 1),
    });
    next.push(winnerSeat(code));
  }
  return next;
}

function dropIn(builder: Builder, input: { survivors: readonly DraftSlot[]; dropping: readonly DraftSlot[]; round: number }): DraftSlot[] {
  return input.survivors.map((seat, index) => {
    const code = add(builder, { code: `L${input.round}-${index + 1}`, stageCode: 'DE', round: 100 + input.round, a: seat, b: seatAt(input.dropping, index) });
    return winnerSeat(code);
  });
}

/**
 * The losers bracket: round 1 pairs the first-round losers; after that it alternates between a
 * "drop-in" round (survivors meet the losers falling from the next winners round, crossed so early
 * rematches are avoided) and a consolidation round among the survivors.
 */
function losersBracket(builder: Builder, winners: readonly string[][]): string {
  let round = 1;
  let survivors = pairUp(builder, { seats: (winners[0] ?? []).map((code) => loserSeat(code)), round });
  for (let wround = 1; wround < winners.length; wround += 1) {
    round += 1;
    const dropping = [...(winners[wround] ?? [])].reverse().map((code) => loserSeat(code));
    survivors = dropIn(builder, { survivors, dropping, round });
    if (survivors.length > 1) {
      round += 1;
      survivors = pairUp(builder, { seats: survivors, round });
    }
  }
  const last = survivors[0];
  return last !== undefined && last.source.kind === 'winner_of' ? last.source.code : '';
}

/** Double elimination: lose twice to go out. The grand final is one match (no bracket reset). */
export const doubleEliminationFormat: FormatPlugin = {
  id: 'double_elimination',
  label: 'Double elimination',
  summary: 'Lose twice to go out; the losers bracket winner meets the winners bracket winner.',
  minTeams: 4,
  maxTeams: 16,
  validate: (teamCount) =>
    between(teamCount, { min: 4, max: 16 }) ?? (isPowerOfTwo(teamCount) ? null : 'Double elimination needs 4, 8 or 16 teams.'),
  build: (entrants): Structure => {
    const builder: Builder = { matches: [] };
    const winners = winnersBracket(builder, entrants);
    const losersFinal = losersBracket(builder, winners);
    const winnersFinal = winners[winners.length - 1]?.[0] ?? '';
    add(builder, { code: 'GF', stageCode: 'DE', round: 200, a: winnerSeat(winnersFinal), b: winnerSeat(losersFinal) });
    return {
      stages: [stageOf({ code: 'DE', ordinal: 1, label: 'Double elimination', kind: 'bracket' })],
      groups: [],
      matches: builder.matches,
    };
  },
  restPolicy: NO_REST_RULE,
  isDynamic: false,
};

const CONSOLATION_PAIRS: readonly [number, number][] = [
  [1, 8],
  [4, 5],
  [3, 6],
  [2, 7],
];

function consolationBuild(entrants: readonly SeededEntrant[]): Structure {
  const builder: Builder = { matches: [] };
  const seed = (rank: number) => entrantSeat(entrants[rank - 1] as SeededEntrant);
  const [q1, q2, q3, q4] = CONSOLATION_PAIRS.map(([home, away], index) =>
    add(builder, { code: `QF${index + 1}`, stageCode: 'MAIN', round: 1, a: seed(home), b: seed(away) }),
  ) as [string, string, string, string];
  const sf1 = add(builder, { code: 'SF1', stageCode: 'MAIN', round: 2, a: winnerSeat(q1), b: winnerSeat(q2) });
  const sf2 = add(builder, { code: 'SF2', stageCode: 'MAIN', round: 2, a: winnerSeat(q3), b: winnerSeat(q4) });
  const c1 = add(builder, { code: 'C1', stageCode: 'MAIN', round: 2, a: loserSeat(q1), b: loserSeat(q2), isPlacement: true });
  const c2 = add(builder, { code: 'C2', stageCode: 'MAIN', round: 2, a: loserSeat(q3), b: loserSeat(q4), isPlacement: true });
  add(builder, { code: 'F', stageCode: 'MAIN', round: 3, a: winnerSeat(sf1), b: winnerSeat(sf2) });
  add(builder, { code: '3RD', stageCode: 'MAIN', round: 3, a: loserSeat(sf1), b: loserSeat(sf2), isPlacement: true });
  add(builder, { code: '5TH', stageCode: 'MAIN', round: 3, a: winnerSeat(c1), b: winnerSeat(c2), isPlacement: true });
  return {
    stages: [stageOf({ code: 'MAIN', ordinal: 1, label: 'Consolation bracket', kind: 'bracket' })],
    groups: [],
    matches: builder.matches,
  };
}

/** The 8-team consolation bracket: everyone plays three, and fifth place is decided too. */
export const consolationFormat: FormatPlugin = {
  id: 'consolation',
  label: 'Consolation bracket',
  summary: 'Eight teams; quarter-final losers play on for fifth, semi-final losers for third.',
  minTeams: 8,
  maxTeams: 8,
  validate: (teamCount) => (teamCount === 8 ? null : 'The consolation bracket is for exactly eight teams.'),
  build: consolationBuild,
  restPolicy: NO_REST_RULE,
  isDynamic: false,
};
