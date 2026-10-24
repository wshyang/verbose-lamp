import type { PointRates } from '../core/index.js';
import type { DraftSlot, KnockoutPairing, SeededEntrant, Structure } from './types.js';
import {
  advancerSeats,
  buildBracketStage,
  buildOpenStage,
  buildPoolStage,
  entrantSeats,
  groupCountFor,
  type StageFragment,
} from './formats/stages.js';

/**
 * ADR-310 — the stage pipeline: a tournament described as an ordered list of
 * stages, each carrying its own scheduler format, its entrant source and its
 * match duration. This is the free-form builder underneath every template:
 * `defaultPipelineSpec` is only its default presentation, and a desk that
 * deletes every default stage and writes its own has changed nothing about
 * the machinery.
 *
 * Formats are overlay concerns (ADR-272); the core sees only the structure
 * this builds — stages, groups and match drafts with forecast seats — exactly
 * as it does from a whole-tournament format today.
 */

export type StageFormatId = 'pool' | 'bracket' | 'open';

export type StageSource =
  | { kind: 'initial' }
  | { kind: 'advancers'; fromStage: string; count: number };

export interface StageOptions {
  groupSize?: number | undefined;
  groupCount?: number | undefined;
  advanceCount?: number | undefined;
  hasThirdPlace?: boolean | undefined;
  pairing?: KnockoutPairing | undefined;
  rates?: PointRates | null | undefined;
  /** ADR-320 — the stage's internal table points (ranking only, never paid); absent = default 3/1/0. */
  tablePoints?: PointRates | null | undefined;
}

export interface StageSpec {
  code: string;
  label: string;
  format: StageFormatId;
  source: StageSource;
  /** Minutes per match in this stage; null inherits the tournament's length. */
  matchMinutes: number | null;
  options?: StageOptions | undefined;
}

export interface PipelineSpec {
  stages: readonly StageSpec[];
}

/**
 * The default presentation: three groups of three at 15 minutes, then the top
 * four (three winners and the best runner-up) cross-seeded into 20-minute
 * semi-finals and a final. A starting point, not a rule.
 */
export function defaultPipelineSpec(): PipelineSpec {
  return {
    stages: [
      {
        code: 'GRP',
        label: 'Group stage',
        format: 'pool',
        source: { kind: 'initial' },
        matchMinutes: 15,
        options: { groupSize: 3, advanceCount: 1 },
      },
      {
        code: 'KO',
        label: 'Knockout',
        format: 'bracket',
        source: { kind: 'advancers', fromStage: 'GRP', count: 4 },
        matchMinutes: 20,
      },
    ],
  };
}

function validateAdvancers(
  spec: StageSpec,
  input: {
    teamCount: number;
    earlier: ReadonlySet<string>;
    fieldOf: ReadonlyMap<string, number>;
    specOf: ReadonlyMap<string, StageSpec>;
  },
): string | null {
  if (spec.source.kind !== 'advancers') return null;
  if (!input.earlier.has(spec.source.fromStage)) return `${spec.code}: advancers must come from an earlier stage.`;
  if (spec.source.count < 2) return `${spec.code}: advancers must number at least two.`;
  if (spec.source.count > input.teamCount) {
    return `${spec.code}: advancers can number no more than the teams entered.`;
  }
  // ADR-320 — reconcile the handover: the next stage's intake cannot exceed the field
  // the feeder actually ranks. Inside that field the intake is always satisfiable —
  // per-group qualifiers first, then the best non-qualifiers on the feeder's internal
  // table as shortfall fills — so a count above the qualifiers is a plan, not an error.
  const field = input.fieldOf.get(spec.source.fromStage);
  if (field !== undefined && spec.source.count > field) {
    return `${spec.code}: ${spec.source.fromStage} only has ${field} teams to send on, so it cannot feed ${spec.source.count}.`;
  }
  const feeder = input.specOf.get(spec.source.fromStage);
  return poolQualifierProblem({ code: spec.code, count: spec.source.count, feeder, teamCount: input.teamCount });
}

/**
 * ADR-328 — the successive stage's input shape must cover the feeder's output shape.
 * For a pool feeder that shape is every per-group qualifier (groups × the per-group
 * count), not merely one seat per group: a lower intake would have to drop somebody
 * who finished in a qualifying place in their own group. Ranked selection is only
 * for the seats past that floor, when the successive shape is a number the pool's
 * qualifiers alone cannot fill.
 */
function poolQualifierProblem(input: { code: string; count: number; feeder: StageSpec | undefined; teamCount: number }): string | null {
  const { feeder } = input;
  if (feeder?.format !== 'pool') return null;
  const qualifiers = poolQualifierCount(feeder, input.teamCount);
  if (input.count >= qualifiers) return null;
  const groups = groupCountFor(fieldOfStage(feeder, input.teamCount), feeder.options ?? {});
  const perGroup = feeder.options?.advanceCount ?? 1;
  return `${input.code}: ${feeder.code} sends ${qualifiers} qualifiers (${groups} groups × ${perGroup} per group), so it cannot feed only ${input.count}. Raise how many go through to at least ${qualifiers}, or lower ${feeder.code}'s per-group count.`;
}

/**
 * ADR-320 — how many teams a stage has to rank: the entered field, or the intake it
 * was fed. Every one of them can be sent on (qualifiers first, fills after), so this
 * is also the stage's output capacity for the reconciliation above.
 */
export function fieldOfStage(spec: StageSpec, teamCount: number): number {
  return spec.source.kind === 'advancers' ? spec.source.count : teamCount;
}

/**
 * ADR-328 — how many of a pool stage's finishers are qualifiers: the configured number
 * from each group, across every group. A successive stage must make room for all of
 * them; only seats beyond this count may be filled from the ranked list of the rest.
 */
export function poolQualifierCount(spec: StageSpec, teamCount: number): number {
  const field = fieldOfStage(spec, teamCount);
  return Math.min(field, groupCountFor(field, spec.options ?? {}) * (spec.options?.advanceCount ?? 1));
}

function validateStage(
  spec: StageSpec,
  input: {
    teamCount: number;
    earlier: ReadonlySet<string>;
    fieldOf: ReadonlyMap<string, number>;
    specOf: ReadonlyMap<string, StageSpec>;
  },
): string | null {
  if (spec.code.trim() === '') return 'A stage needs a code.';
  if (spec.matchMinutes !== null && (spec.matchMinutes < 1 || spec.matchMinutes > 180)) {
    return `${spec.code}: a stage's match minutes must be between 1 and 180.`;
  }
  const advancers = validateAdvancers(spec, input);
  if (advancers !== null) return advancers;
  if (spec.format === 'pool') return validatePool(spec, fieldOfStage(spec, input.teamCount));
  return null;
}

/**
 * ADR-325 — sized from the stage's own field: the entered teams for a first stage, the intake it
 * was fed for a later one. (ADR-310 refused a fed pool because its groups could not be dealt
 * before they were known; they are now dealt as seats and filled when the feeder closes.)
 */
function validatePool(spec: StageSpec, teamCount: number): string | null {
  const groupCount = groupCountFor(teamCount, spec.options ?? {});
  const smallest = Math.floor(teamCount / groupCount);
  if (smallest < 2) return `${spec.code}: every group needs at least two teams.`;
  const advanceCount = spec.options?.advanceCount ?? 1;
  if (advanceCount < 1) return `${spec.code}: at least one team must go through from each group.`;
  if (advanceCount >= smallest && groupCount > 1) {
    return `${spec.code}: fewer teams must go through than the smallest group holds.`;
  }
  return null;
}

/** Why this pipeline cannot be built over this many teams, or null when it can. */
export function validatePipeline(spec: PipelineSpec, teamCount: number): string | null {
  if (spec.stages.length === 0) return 'A pipeline needs at least one stage.';
  if (teamCount < 2) return 'A tournament needs at least two teams.';
  const codes = new Set<string>();
  const fieldOf = new Map<string, number>();
  const specOf = new Map<string, StageSpec>();
  for (const stage of spec.stages) {
    if (codes.has(stage.code)) return 'Stage codes must be unique.';
    const refusal = validateStage(stage, { teamCount, earlier: codes, fieldOf, specOf });
    if (refusal !== null) return refusal;
    codes.add(stage.code);
    fieldOf.set(stage.code, fieldOfStage(stage, teamCount));
    specOf.set(stage.code, stage);
  }
  return null;
}

/** ADR-325 — the feeder and the intake, carried onto the built stage so the core can fill it when the feeder closes. */
function intakeOf(spec: StageSpec): { fromStageCode: string; count: number } | null {
  return spec.source.kind === 'advancers' ? { fromStageCode: spec.source.fromStage, count: spec.source.count } : null;
}

function buildStage(
  spec: StageSpec,
  input: { ordinal: number; entrants: readonly SeededEntrant[]; firstSequence: number },
): StageFragment {
  const options = spec.options ?? {};
  const intake = intakeOf(spec);
  if (spec.format === 'pool') {
    return buildPoolStage({
      code: spec.code,
      ordinal: input.ordinal,
      label: spec.label,
      entrants: input.entrants,
      seats: spec.source.kind === 'advancers' ? advancerSeats(spec.source.fromStage, spec.source.count) : undefined,
      groupSize: options.groupSize,
      groupCount: options.groupCount,
      advanceCount: options.advanceCount,
      rates: options.rates,
      tablePoints: options.tablePoints,
      matchMinutes: spec.matchMinutes,
      firstSequence: input.firstSequence,
      intake,
    });
  }
  if (spec.format === 'open') {
    return buildOpenStage({ code: spec.code, ordinal: input.ordinal, label: spec.label, tablePoints: options.tablePoints, matchMinutes: spec.matchMinutes, intake });
  }
  const seeds =
    spec.source.kind === 'advancers'
      ? advancerSeats(spec.source.fromStage, spec.source.count)
      : entrantSeats(input.entrants);
  return buildBracketStage({
    code: spec.code,
    ordinal: input.ordinal,
    label: spec.label,
    seeds,
    hasThirdPlace: options.hasThirdPlace,
    pairing: options.pairing,
    rates: options.rates,
    tablePoints: options.tablePoints,
    matchMinutes: spec.matchMinutes,
    firstSequence: input.firstSequence,
    intake,
  });
}

/**
 * ADR-325 — group and match codes are keys across the whole structure (the adapter mints one id per
 * code), but every pool stage names its groups A, B, C and numbers its fixtures A1, A2 ... The first
 * stage to use a code keeps it; a later stage's colliding codes are prefixed with its stage code
 * ("P2-A", "P2-A1"), in the groups, in the fixtures, and in every winner_of / loser_of reference to
 * a renamed fixture.
 */
interface TakenCodes {
  groups: Set<string>;
  matches: Set<string>;
}

function renamesFor(codes: readonly string[], input: { prefix: string; taken: Set<string> }): Map<string, string> {
  const renamed = new Map<string, string>();
  for (const code of codes) {
    const next = input.taken.has(code) ? `${input.prefix}-${code}` : code;
    renamed.set(code, next);
    input.taken.add(next);
  }
  return renamed;
}

function renameSeat(seat: DraftSlot, matches: ReadonlyMap<string, string>): DraftSlot {
  const { source } = seat;
  if (source.kind !== 'winner_of' && source.kind !== 'loser_of') return seat;
  return { ...seat, source: { ...source, code: matches.get(source.code) ?? source.code } };
}

function withUniqueCodes(fragment: StageFragment, taken: TakenCodes): StageFragment {
  const stageCode = fragment.stage.code;
  const groups = renamesFor(fragment.groups.map((group) => group.code), { prefix: stageCode, taken: taken.groups });
  const matches = renamesFor(fragment.matches.map((match) => match.code), { prefix: stageCode, taken: taken.matches });
  const unchanged = [...groups, ...matches].every(([from, to]) => from === to);
  if (unchanged) return fragment;
  return {
    ...fragment,
    groups: fragment.groups.map((group) => ({ ...group, code: groups.get(group.code) ?? group.code })),
    matches: fragment.matches.map((match) => ({
      ...match,
      code: matches.get(match.code) ?? match.code,
      groupCode: match.groupCode === null ? null : (groups.get(match.groupCode) ?? match.groupCode),
      a: renameSeat(match.a, matches),
      b: renameSeat(match.b, matches),
    })),
  };
}

/**
 * The whole structure, from stage 1 to the last, with one sequence running
 * through it. Callers validate first (`validatePipeline`); this assumes the
 * spec it is given can be built.
 */
export function buildPipeline(spec: PipelineSpec, entrants: readonly SeededEntrant[]): Structure {
  const built: StageFragment[] = [];
  const taken: TakenCodes = { groups: new Set(), matches: new Set() };
  let sequence = 1;
  for (const [index, stage] of spec.stages.entries()) {
    const raw = buildStage(stage, { ordinal: index + 1, entrants, firstSequence: sequence });
    const fragment = withUniqueCodes(raw, taken);
    built.push(fragment);
    sequence += fragment.matches.length;
  }
  return {
    stages: built.map((fragment) => fragment.stage),
    groups: built.flatMap((fragment) => fragment.groups),
    matches: built.flatMap((fragment) => fragment.matches),
  };
}
