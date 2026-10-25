import type { DraftGroup, DraftMatch, DraftSlot, DraftStage, SeededEntrant } from '../types.js';
import type { PointRates } from '../../core/index.js';
import {
  buildKnockout,
  entrantSeat,
  seatFixtures,
  groupLetter,
  interleaveByRound,
  snakeDeal,
  stageOf,
  stagePlaceSeat,
} from './common.js';

/**
 * ADR-310 — stage formats: the whole-tournament formats, decomposed into the one
 * stage each of them knows how to build. A pipeline (pipeline.ts) composes these;
 * a stage is dealt when it is built, so a pool can only ever be dealt from the
 * initial entrants — group membership cannot be dealt before it is known.
 */

export interface StageFragment {
  stage: DraftStage;
  groups: DraftGroup[];
  matches: DraftMatch[];
}

export interface PoolStageInput {
  code: string;
  ordinal: number;
  label: string;
  /** The teams, when they are known at build time (the first stage). */
  entrants: readonly SeededEntrant[];
  /**
   * ADR-325 — or the places they will take, when an earlier stage decides them. Present means
   * "deal these seats"; the groups are then built empty and filled when the feeder closes.
   */
  seats?: readonly DraftSlot[] | undefined;
  groupSize?: number | undefined;
  groupCount?: number | undefined;
  advanceCount?: number | undefined;
  rates?: PointRates | null | undefined;
  tablePoints?: PointRates | null | undefined;
  matchMinutes: number | null;
  firstSequence: number;
  intake?: { fromStageCode: string; count: number } | null | undefined;
}

export function groupCountFor(teamCount: number, input: { groupSize?: number | undefined; groupCount?: number | undefined }): number {
  if (input.groupCount !== undefined) return input.groupCount;
  return Math.max(2, Math.round(teamCount / (input.groupSize ?? 4)));
}

/** A pool stage: snake-dealt groups, a round robin in each, interleaved by round. */
export function buildPoolStage(input: PoolStageInput): StageFragment {
  const seats = input.seats ?? input.entrants.map((entrant) => entrantSeat(entrant));
  const isDealtLater = input.seats !== undefined;
  const groupCount = groupCountFor(seats.length, input);
  const dealt = snakeDeal(seats, groupCount);
  const groups: DraftGroup[] = dealt.map((members, index) => ({
    code: groupLetter(index),
    stageCode: input.code,
    label: `Group ${groupLetter(index)}`,
    // Known members now, or none until the feeder's close fills them (core/stages.ts, ADR-325).
    entrantIds: isDealtLater ? [] : members.flatMap((seat) => (seat.source.kind === 'entrant' ? [seat.source.entrantId] : [])),
  }));
  const perGroup = dealt.map((members, index) =>
    seatFixtures({
      seats: members,
      stageCode: input.code,
      groupCode: groupLetter(index),
      codePrefix: groupLetter(index),
      firstSequence: input.firstSequence,
    }),
  );
  return {
    stage: stageOf({
      code: input.code,
      ordinal: input.ordinal,
      label: input.label,
      kind: 'pool',
      advanceCount: input.advanceCount ?? 1,
      rates: input.rates ?? null,
      tablePoints: input.tablePoints ?? null,
      matchMinutes: input.matchMinutes,
      intake: input.intake ?? null,
    }),
    groups,
    matches: interleaveByRound(perGroup, input.firstSequence),
  };
}

export interface BracketStageInput {
  code: string;
  ordinal: number;
  label: string;
  /** The seats in seed order; cross-seeding happens here, in the order given. */
  seeds: readonly DraftSlot[];
  hasThirdPlace?: boolean | undefined;
  pairing?: 'classic' | 'adjacent' | undefined;
  rates?: PointRates | null | undefined;
  tablePoints?: PointRates | null | undefined;
  matchMinutes: number | null;
  firstSequence: number;
  intake?: { fromStageCode: string; count: number } | null | undefined;
}

/** A bracket stage: one knockout over the seats it is handed. */
export function buildBracketStage(input: BracketStageInput): StageFragment {
  const built = buildKnockout({
    seeds: input.seeds,
    stageCode: input.code,
    codePrefix: input.code,
    pairing: input.pairing ?? 'classic',
    hasThirdPlace: input.hasThirdPlace ?? false,
    firstSequence: input.firstSequence,
    firstRound: 1,
  });
  return {
    stage: stageOf({
      code: input.code,
      ordinal: input.ordinal,
      label: input.label,
      kind: 'bracket',
      rates: input.rates ?? null,
      tablePoints: input.tablePoints ?? null,
      matchMinutes: input.matchMinutes,
      intake: input.intake ?? null,
    }),
    groups: [],
    matches: built.matches,
  };
}

/** The advancer seats of a feeder stage, in advancer order (1st overall first). */
export function advancerSeats(stageCode: string, count: number): DraftSlot[] {
  return Array.from({ length: count }, (_, index) =>
    stagePlaceSeat(stageCode, { place: index + 1, label: `#${index + 1} overall` }),
  );
}

/** The initial entrants as bracket seats, in seed order. */
export function entrantSeats(entrants: readonly SeededEntrant[]): DraftSlot[] {
  return entrants.map((entrant) => entrantSeat(entrant));
}

export interface OpenStageInput {
  code: string;
  ordinal: number;
  label: string;
  tablePoints?: PointRates | null | undefined;
  matchMinutes: number | null;
  intake?: { fromStageCode: string; count: number } | null | undefined;
}

/** An open stage: the stage exists, every match in it is a person's to stage. */
export function buildOpenStage(input: OpenStageInput): StageFragment {
  return {
    stage: stageOf({ code: input.code, ordinal: input.ordinal, label: input.label, kind: 'open', tablePoints: input.tablePoints ?? null, matchMinutes: input.matchMinutes, intake: input.intake ?? null }),
    groups: [],
    matches: [],
  };
}
