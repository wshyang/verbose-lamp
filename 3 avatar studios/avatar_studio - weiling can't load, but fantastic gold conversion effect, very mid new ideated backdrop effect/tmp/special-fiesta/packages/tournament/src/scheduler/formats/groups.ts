import type { DraftGroup, DraftMatch, DraftSlot, FormatPlugin, KnockoutPairing, SeededEntrant, Structure } from '../types.js';
import { between } from './basic.js';
import {
  bracketOrder,
  buildKnockout,
  entrantSeat,
  groupFixtures,
  groupLetter,
  groupPlaceSeat,
  interleaveByRound,
  loserSeat,
  nextPowerOfTwo,
  ordinal,
  snakeDeal,
  stageOf,
  stagePlaceSeat,
  winnerSeat,
} from './common.js';

/**
 * ADR-274 — the formats that start in groups: groups then a knockout (the World Cup shape), points
 * rush (pools of three, then the overall leaders meet) and flighted quads (fours that play their own
 * little knockout). Group play is interleaved by round so no group waits for another to finish.
 */

const NO_REST_RULE = { restMinutes: null, flagBackToBack: false } as const;

interface DealtGroups {
  groups: DraftGroup[];
  matches: DraftMatch[];
}

function dealGroups(entrants: readonly SeededEntrant[], input: { groupCount: number; stageCode: string }): DealtGroups {
  const dealt = snakeDeal(entrants, input.groupCount);
  const groups = dealt.map((members, index) => ({
    code: groupLetter(index),
    stageCode: input.stageCode,
    label: `Group ${groupLetter(index)}`,
    entrantIds: members.map((member) => member.id),
  }));
  const perGroup = dealt.map((members, index) =>
    groupFixtures({
      entrants: members,
      stageCode: input.stageCode,
      groupCode: groupLetter(index),
      codePrefix: groupLetter(index),
      firstSequence: 1,
    }),
  );
  return { groups, matches: interleaveByRound(perGroup, 1) };
}

/** The round two bracket positions could meet in: 1 is the first round, the bracket's depth the final. */
function meetingRound(left: number, right: number): number {
  return Math.floor(Math.log2(left ^ right)) + 1;
}

interface Qualifier {
  groupCode: string;
  place: number;
}

interface Separation {
  /** Seeds (1-based) of the group-mates already placed. */
  mates: readonly number[];
  positionOf: (seed: number) => number;
}

/** The free seed that keeps a team furthest from its group-mates; the lower seed on a tie. */
function farthestSeed(free: readonly number[], input: Separation): number {
  let best = free[0] ?? 0;
  let bestRound = -Infinity;
  for (const seed of free) {
    const round = Math.min(...input.mates.map((mate) => meetingRound(input.positionOf(seed), input.positionOf(mate))));
    if (round > bestRound) {
      best = seed;
      bestRound = round;
    }
  }
  return best;
}

/** One place's qualifiers (every group's runner-up, say), dealt onto the next block of seeds. */
function dealPlace(bySeed: readonly Qualifier[], input: { codes: readonly string[]; place: number; positionOf: (seed: number) => number }): Qualifier[] {
  let free = input.codes.map((_, index) => bySeed.length + index + 1);
  const dealt: { seed: number; row: Qualifier }[] = [];
  for (const groupCode of input.codes) {
    const mates = bySeed.flatMap((row, index) => (row.groupCode === groupCode ? [index + 1] : []));
    const seed = farthestSeed(free, { mates, positionOf: input.positionOf });
    dealt.push({ seed, row: { groupCode, place: input.place } });
    free = free.filter((candidate) => candidate !== seed);
  }
  return [...dealt].sort((left, right) => left.seed - right.seed).map((entry) => entry.row);
}

/**
 * The qualifiers in bracket seed order. Group winners take the top seeds in group order, so the best
 * of them are the ones a bye goes to; each later place is dealt so every team sits as far from its own
 * group-mates as the bracket allows. A winner never meets its own runner-up in the first round (the
 * World Cup's 1A v 2B), and with two qualifiers a group they can meet only in the final.
 */
function qualifierSeats(input: { groupCount: number; advanceCount: number; pairing: KnockoutPairing }): DraftSlot[] {
  const codes = Array.from({ length: input.groupCount }, (_, index) => groupLetter(index));
  const order = bracketOrder(nextPowerOfTwo(Math.max(2, input.groupCount * input.advanceCount)), input.pairing);
  const positionOf = (seed: number) => order.indexOf(seed);
  let bySeed: Qualifier[] = codes.map((groupCode) => ({ groupCode, place: 1 }));
  for (let place = 2; place <= input.advanceCount; place += 1) {
    bySeed = [...bySeed, ...dealPlace(bySeed, { codes, place, positionOf })];
  }
  return bySeed.map((row) => groupPlaceSeat(row.groupCode, row.place));
}

function groupCountFor(teamCount: number, groupSize: number): number {
  return Math.max(2, Math.round(teamCount / groupSize));
}

function validateGroups(teamCount: number, options: { groupSize?: number; advanceCount?: number }): string | null {
  const bounds = between(teamCount, { min: 4, max: 32 });
  if (bounds) return bounds;
  const groupCount = groupCountFor(teamCount, options.groupSize ?? 4);
  const smallest = Math.floor(teamCount / groupCount);
  if (smallest < 2) return 'Every group needs at least two teams.';
  if ((options.advanceCount ?? 2) >= smallest) return 'Fewer teams must go through than the smallest group holds.';
  return null;
}

/** Groups, then a knockout from the top of each group (the World Cup shape). */
export const groupsKnockoutFormat: FormatPlugin = {
  id: 'groups_knockout',
  label: 'Groups then knockout',
  summary: 'Pools first; the top of each pool goes into a knockout.',
  minTeams: 4,
  maxTeams: 32,
  validate: validateGroups,
  build: (entrants, options) => {
    const advanceCount = options.advanceCount ?? 2;
    const groupCount = groupCountFor(entrants.length, options.groupSize ?? 4);
    const dealt = dealGroups(entrants, { groupCount, stageCode: 'GRP' });
    const pairing = options.pairing ?? 'classic';
    const knockout = buildKnockout({
      seeds: qualifierSeats({ groupCount, advanceCount, pairing }),
      stageCode: 'KO',
      codePrefix: 'K',
      pairing,
      hasThirdPlace: options.hasThirdPlace ?? false,
      firstSequence: dealt.matches.length + 1,
      firstRound: 1,
    });
    return {
      stages: [
        stageOf({ code: 'GRP', ordinal: 1, label: 'Group stage', kind: 'pool', advanceCount, tablePoints: options.tablePoints ?? null }),
        stageOf({ code: 'KO', ordinal: 2, label: 'Knockout', kind: 'bracket' }),
      ],
      groups: dealt.groups,
      matches: [...dealt.matches, ...knockout.matches],
    };
  },
  restPolicy: NO_REST_RULE,
  isDynamic: false,
};

function pointsRushFinals(input: { groupCount: number; firstSequence: number; hasThirdPlace: boolean }): DraftMatch[] {
  const placeSeat = (place: number) => stagePlaceSeat('POOL', { place, label: `#${place} overall` });
  const final: DraftMatch = {
    code: 'GF',
    stageCode: 'FINAL',
    groupCode: null,
    round: 1,
    sequence: input.firstSequence,
    isPlacement: false,
    a: placeSeat(1),
    b: placeSeat(2),
  };
  if (!input.hasThirdPlace || input.groupCount < 4) return [final];
  return [final, { ...final, code: 'P3', sequence: input.firstSequence + 1, isPlacement: true, a: placeSeat(3), b: placeSeat(4) }];
}

/** Points rush: pools of three, then the pool winners ranked overall; #1 v #2 for the title. */
export const pointsRushFormat: FormatPlugin = {
  id: 'points_rush',
  label: 'Points rush',
  summary: 'Pools of three; the best pool winners overall meet in the final.',
  minTeams: 6,
  maxTeams: 30,
  validate: (teamCount) =>
    between(teamCount, { min: 6, max: 30 }) ?? (teamCount % 3 === 0 ? null : 'Points rush needs a multiple of three teams.'),
  build: (entrants, options): Structure => {
    const groupCount = entrants.length / 3;
    const dealt = dealGroups(entrants, { groupCount, stageCode: 'POOL' });
    const finals = pointsRushFinals({ groupCount, firstSequence: dealt.matches.length + 1, hasThirdPlace: options.hasThirdPlace ?? false });
    return {
      stages: [
        stageOf({ code: 'POOL', ordinal: 1, label: 'Pools', kind: 'pool', advanceCount: 1, tablePoints: options.tablePoints ?? null }),
        stageOf({ code: 'FINAL', ordinal: 2, label: 'Final', kind: 'bracket' }),
      ],
      groups: dealt.groups,
      matches: [...dealt.matches, ...finals],
    };
  },
  restPolicy: NO_REST_RULE,
  isDynamic: false,
};

function flightMatch(letter: string, input: { code: string; round: number; a: DraftSlot; b: DraftSlot; isPlacement: boolean }): DraftMatch {
  return {
    code: `${letter}-${input.code}`,
    stageCode: 'FLIGHTS',
    groupCode: letter,
    round: input.round,
    sequence: 0,
    isPlacement: input.isPlacement,
    a: input.a,
    b: input.b,
  };
}

function flightMatches(flight: readonly SeededEntrant[], letter: string): DraftMatch[] {
  const [one, two, three, four] = flight as [SeededEntrant, SeededEntrant, SeededEntrant, SeededEntrant];
  return [
    flightMatch(letter, { code: 'SF1', round: 1, a: entrantSeat(one), b: entrantSeat(four), isPlacement: false }),
    flightMatch(letter, { code: 'SF2', round: 1, a: entrantSeat(two), b: entrantSeat(three), isPlacement: false }),
    flightMatch(letter, { code: 'F', round: 2, a: winnerSeat(`${letter}-SF1`), b: winnerSeat(`${letter}-SF2`), isPlacement: false }),
    flightMatch(letter, { code: '3RD', round: 2, a: loserSeat(`${letter}-SF1`), b: loserSeat(`${letter}-SF2`), isPlacement: true }),
  ];
}

/** Flighted quads: consecutive seeds form flights of four, each playing its own semis and final. */
export const flightedQuadsFormat: FormatPlugin = {
  id: 'flighted_quads',
  label: 'Flighted quads',
  summary: 'Flights of four play their own semi-finals, final and third-place match.',
  minTeams: 8,
  maxTeams: 32,
  validate: (teamCount) =>
    between(teamCount, { min: 8, max: 32 }) ?? (teamCount % 4 === 0 ? null : 'Flighted quads needs a multiple of four teams.'),
  build: (entrants): Structure => {
    const flights = Array.from({ length: entrants.length / 4 }, (_, index) => entrants.slice(index * 4, index * 4 + 4));
    return {
      stages: [stageOf({ code: 'FLIGHTS', ordinal: 1, label: 'Flights', kind: 'bracket' })],
      groups: flights.map((flight, index) => ({
        code: groupLetter(index),
        stageCode: 'FLIGHTS',
        label: `${ordinal(index + 1)} flight`,
        entrantIds: flight.map((entrant) => entrant.id),
      })),
      matches: interleaveByRound(
        flights.map((flight, index) => flightMatches(flight, groupLetter(index))),
        1,
      ),
    };
  },
  restPolicy: NO_REST_RULE,
  isDynamic: false,
};
