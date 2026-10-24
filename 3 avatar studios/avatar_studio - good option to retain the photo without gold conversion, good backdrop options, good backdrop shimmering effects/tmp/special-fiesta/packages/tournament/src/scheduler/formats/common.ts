import type { PointRates } from '../../core/index.js';
import type { DraftMatch, DraftSlot, DraftStage, KnockoutPairing, SeededEntrant } from '../types.js';

/**
 * ADR-274 — the building blocks every format is assembled from: seats, the circle method, and a
 * seeded bracket with byes as structure. Pure functions of their inputs; nothing random, so the same
 * field always draws the same day (P-12's "arrived at again with the same result").
 */

export function entrantSeat(entrant: SeededEntrant): DraftSlot {
  return { source: { kind: 'entrant', entrantId: entrant.id }, label: entrant.name };
}

export function winnerSeat(code: string): DraftSlot {
  return { source: { kind: 'winner_of', code }, label: `Winner of ${code}` };
}

export function loserSeat(code: string): DraftSlot {
  return { source: { kind: 'loser_of', code }, label: `Loser of ${code}` };
}

const BYE: DraftSlot = { source: { kind: 'vacant' }, label: 'Bye' };

export function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  const unit = place % 10;
  if (unit === 1) return `${place}st`;
  if (unit === 2) return `${place}nd`;
  if (unit === 3) return `${place}rd`;
  return `${place}th`;
}

export function groupPlaceSeat(groupCode: string, place: number): DraftSlot {
  return { source: { kind: 'group_place', groupCode, place }, label: `${ordinal(place)} in Group ${groupCode}` };
}

export function stagePlaceSeat(stageCode: string, input: { place: number; label: string }): DraftSlot {
  return { source: { kind: 'stage_place', stageCode, place: input.place }, label: input.label };
}

export function stageOf(input: {
  code: string;
  ordinal: number;
  label: string;
  kind: DraftStage['kind'];
  advanceCount?: number;
  rates?: PointRates | null;
  tablePoints?: PointRates | null;
  matchMinutes?: number | null;
  intake?: { fromStageCode: string; count: number } | null;
}): DraftStage {
  return {
    code: input.code,
    ordinal: input.ordinal,
    label: input.label,
    kind: input.kind,
    allowsDraws: input.kind === 'pool' || input.kind === 'open',
    advanceCount: input.advanceCount ?? 0,
    rates: input.rates ?? null,
    tablePoints: input.tablePoints ?? null,
    matchMinutes: input.matchMinutes ?? null,
    intake: input.intake ?? null,
  };
}

/** Circle-method rounds over a list; an odd list rests one team per round (no phantom match). */
export function circleRounds<T>(items: readonly T[]): [T, T][][] {
  const padded: (T | null)[] = items.length % 2 === 0 ? [...items] : [...items, null];
  const rounds: [T, T][][] = [];
  let ring = padded;
  for (let round = 0; round < padded.length - 1; round += 1) {
    const pairs: [T, T][] = [];
    for (let index = 0; index < padded.length / 2; index += 1) {
      const home = ring[index] ?? null;
      const away = ring[padded.length - 1 - index] ?? null;
      if (home !== null && away !== null) pairs.push([home, away]);
    }
    rounds.push(pairs);
    ring = [ring[0] ?? null, ring[ring.length - 1] ?? null, ...ring.slice(1, -1)];
  }
  return rounds;
}

/** Bracket positions for seeds 1..size, classic (1 v size, kept apart) or adjacent (1 v 2). */
export function bracketOrder(size: number, pairing: KnockoutPairing): number[] {
  if (pairing === 'adjacent') return Array.from({ length: size }, (_, index) => index + 1);
  let order = [1];
  while (order.length < size) {
    const width = order.length * 2;
    order = order.flatMap((seed) => [seed, width + 1 - seed]);
  }
  return order;
}

export function nextPowerOfTwo(count: number): number {
  let size = 1;
  while (size < count) size *= 2;
  return size;
}

export function isPowerOfTwo(count: number): boolean {
  return count > 0 && (count & (count - 1)) === 0;
}

export interface KnockoutInput {
  /** Seats in seed order: index 0 is seed 1. Seats past the field are byes. */
  seeds: readonly DraftSlot[];
  stageCode: string;
  codePrefix: string;
  pairing: KnockoutPairing;
  hasThirdPlace: boolean;
  firstSequence: number;
  firstRound: number;
}

export interface KnockoutBuild {
  matches: DraftMatch[];
  /** The last bracket match: the one that decides the champion. */
  finalCode: string | null;
}

interface PendingSeat {
  slot: DraftSlot;
  isBye: boolean;
}

function firstRoundSeats(input: KnockoutInput): PendingSeat[] {
  const size = nextPowerOfTwo(Math.max(2, input.seeds.length));
  return bracketOrder(size, input.pairing).map((seed) => {
    const slot = input.seeds[seed - 1];
    return slot === undefined ? { slot: BYE, isBye: true } : { slot, isBye: false };
  });
}

type Paired = { kind: 'bye'; seat: PendingSeat } | { kind: 'match'; home: DraftSlot; away: DraftSlot };

function pairSeats(home: PendingSeat, away: PendingSeat): Paired {
  if (home.isBye) return { kind: 'bye', seat: away };
  if (away.isBye) return { kind: 'bye', seat: home };
  return { kind: 'match', home: home.slot, away: away.slot };
}

interface RoundBuild {
  next: PendingSeat[];
  matches: DraftMatch[];
}

function buildRound(input: KnockoutInput, at: { seats: readonly PendingSeat[]; round: number; sequence: number }): RoundBuild {
  const next: PendingSeat[] = [];
  const matches: DraftMatch[] = [];
  for (let index = 0; index < at.seats.length; index += 2) {
    const pair = pairSeats(at.seats[index] ?? { slot: BYE, isBye: true }, at.seats[index + 1] ?? { slot: BYE, isBye: true });
    if (pair.kind === 'bye') {
      next.push(pair.seat);
      continue;
    }
    const code = `${input.codePrefix}${at.round}-${index / 2 + 1}`;
    matches.push({
      code,
      stageCode: input.stageCode,
      groupCode: null,
      round: at.round,
      sequence: at.sequence + matches.length,
      isPlacement: false,
      a: pair.home,
      b: pair.away,
    });
    next.push({ slot: winnerSeat(code), isBye: false });
  }
  return { next, matches };
}

/**
 * A single-elimination bracket over seeded seats. A bye is structure, never a match (P-12): the
 * seat that meets a bye goes straight to the next round. A third-place match exists only when the
 * bracket really produced two semi-final losers.
 */
export function buildKnockout(input: KnockoutInput): KnockoutBuild {
  let seats = firstRoundSeats(input);
  const matches: DraftMatch[] = [];
  let round = input.firstRound;
  let semiCodes: string[] = [];
  while (seats.length > 1) {
    const built = buildRound(input, { seats, round, sequence: input.firstSequence + matches.length });
    if (seats.length === 4) semiCodes = built.matches.map((match) => match.code);
    matches.push(...built.matches);
    seats = built.next;
    round += 1;
  }
  const finalCode = matches[matches.length - 1]?.code ?? null;
  if (!input.hasThirdPlace || semiCodes.length !== 2) return { matches, finalCode };
  const [first, second] = semiCodes as [string, string];
  const third: DraftMatch = {
    code: `${input.codePrefix}3RD`,
    stageCode: input.stageCode,
    groupCode: null,
    round: round - 1,
    sequence: input.firstSequence + matches.length,
    isPlacement: true,
    a: loserSeat(first),
    b: loserSeat(second),
  };
  return { matches: [...matches, third], finalCode };
}

/** Deals items into groups snake-wise (1 A, 2 B, 3 C, 4 C, 5 B …) so seeds spread evenly. */
export function snakeDeal<T>(items: readonly T[], groupCount: number): T[][] {
  const groups: T[][] = Array.from({ length: groupCount }, () => []);
  items.forEach((item, index) => {
    const lap = Math.floor(index / groupCount);
    const position = index % groupCount;
    const target = lap % 2 === 0 ? position : groupCount - 1 - position;
    groups[target] = [...(groups[target] ?? []), item];
  });
  return groups;
}

export function groupLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Round-robin fixtures inside one group, numbered from `firstSequence`. */
export function groupFixtures(input: {
  entrants: readonly SeededEntrant[];
  stageCode: string;
  groupCode: string | null;
  codePrefix: string;
  firstSequence: number;
}): DraftMatch[] {
  return seatFixtures({ ...input, seats: input.entrants.map((entrant) => entrantSeat(entrant)) });
}

/**
 * ADR-325 — the same round robin over SEATS. A pool fed by an earlier stage cannot name its teams
 * when the pipeline is built, but it can name the places they will take ("#3 overall"), exactly as
 * a bracket already does; the people sit down when the feeder closes.
 */
export function seatFixtures(input: {
  seats: readonly DraftSlot[];
  stageCode: string;
  groupCode: string | null;
  codePrefix: string;
  firstSequence: number;
}): DraftMatch[] {
  const matches: DraftMatch[] = [];
  circleRounds(input.seats).forEach((pairs, roundIndex) => {
    for (const [home, away] of pairs) {
      matches.push({
        code: `${input.codePrefix}${matches.length + 1}`,
        stageCode: input.stageCode,
        groupCode: input.groupCode,
        round: roundIndex + 1,
        sequence: input.firstSequence + matches.length,
        isPlacement: false,
        a: home,
        b: away,
      });
    }
  });
  return matches;
}

/**
 * Interleaves several groups' fixtures round by round (A1, B1, C1, A2, B2 …) and renumbers them,
 * so no group plays out its whole table before the next one starts (both references ran groups
 * back to back, which idles teams and courts — P-06).
 */
export function interleaveByRound(groups: readonly DraftMatch[][], firstSequence: number): DraftMatch[] {
  const longest = groups.reduce((most, group) => Math.max(most, group.length), 0);
  const ordered: DraftMatch[] = [];
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const match = group[index];
      if (match !== undefined) ordered.push(match);
    }
  }
  return ordered.map((match, index) => ({ ...match, sequence: firstSequence + index }));
}
