import { findFormat } from './formats/index.js';
import { buildPipeline, validatePipeline, type PipelineSpec } from './pipeline.js';
import { plan, type FitSummary, type Placement, type PlanMatch } from './planner.js';
import type { DraftMatch, FormatId, FormatOptions, SeededEntrant, Structure } from './types.js';

/**
 * ADR-274 — the simulator's engine: build a format over N placeholder teams and plan it, with no
 * database and no ids. It is the same `build` and the same `plan` the live tournament uses, so what
 * the superadmin rehearses in the browser is what the day will actually do.
 */

export interface SimulationInput {
  formatId?: FormatId | undefined;
  options?: FormatOptions | undefined;
  /** ADR-311 — or a stage pipeline instead of a whole-tournament format (ADR-310). */
  pipeline?: PipelineSpec | undefined;
  teamCount: number;
  courtCount: number;
  matchMinutes: number;
  changeoverMinutes: number;
  restMinutes: number;
  /** Minutes from midnight, local. */
  startMinute: number;
  deadlineMinute: number | null;
}

export interface SimulatedMatch {
  code: string;
  stageCode: string;
  groupCode: string | null;
  round: number;
  aLabel: string;
  bLabel: string;
  courtIndex: number | null;
  start: number | null;
  end: number | null;
  isBackToBack: boolean;
}

export interface SimulationResult {
  error: string | null;
  structure: Structure | null;
  matches: SimulatedMatch[];
  fit: FitSummary | null;
}

function placeholders(count: number): SeededEntrant[] {
  return Array.from({ length: count }, (_, index) => ({ id: `T${index + 1}`, name: `Team ${index + 1}`, seed: index + 1 }));
}

function knownEntrants(match: DraftMatch): (string | null)[] {
  return [match.a, match.b].map((seat) => (seat.source.kind === 'entrant' ? seat.source.entrantId : null));
}

/** Draft dependencies by code: winner/loser seats, plus every match of a group or stage a place is read from. */
export function draftDependencies(structure: Structure, match: DraftMatch): string[] {
  const codes = new Set<string>();
  for (const seat of [match.a, match.b]) {
    const source = seat.source;
    if (source.kind === 'winner_of' || source.kind === 'loser_of') codes.add(source.code);
    const readFrom =
      source.kind === 'group_place'
        ? structure.matches.filter((other) => other.groupCode === source.groupCode && other.stageCode !== match.stageCode)
        : source.kind === 'stage_place'
          ? structure.matches.filter((other) => other.stageCode === source.stageCode)
          : [];
    for (const other of readFrom) codes.add(other.code);
  }
  return [...codes];
}

export function toPlanMatches(structure: Structure, minutes: number): PlanMatch[] {
  return structure.matches.map((match) => ({
    id: match.code,
    priority: match.sequence,
    entrants: knownEntrants(match),
    dependsOn: draftDependencies(structure, match),
    feeders: [match.a, match.b].flatMap((seat) => (seat.source.kind === 'winner_of' || seat.source.kind === 'loser_of' ? [seat.source.code] : [])),
    minutes,
  }));
}

function simulated(match: DraftMatch, input: { placement: Placement | undefined; courtIds: readonly string[] }): SimulatedMatch {
  const placement = input.placement;
  return {
    code: match.code,
    stageCode: match.stageCode,
    groupCode: match.groupCode,
    round: match.round,
    aLabel: match.a.label,
    bLabel: match.b.label,
    courtIndex: placement === undefined ? null : input.courtIds.indexOf(placement.courtId),
    start: placement?.start ?? null,
    end: placement?.end ?? null,
    isBackToBack: placement?.isBackToBack ?? false,
  };
}

const NO_RESULT = { structure: null, matches: [], fit: null };

export function simulate(input: SimulationInput): SimulationResult {
  const options = input.options ?? {};
  const format = input.pipeline === undefined ? findFormat(input.formatId ?? '') : null;
  if (input.pipeline === undefined && format === null) return { error: 'Unknown format.', ...NO_RESULT };
  const seeded = placeholders(input.teamCount);
  const invalid =
    input.pipeline !== undefined
      ? validatePipeline(input.pipeline, input.teamCount)
      : (format as NonNullable<typeof format>).validate(input.teamCount, options);
  if (invalid !== null) return { error: invalid, ...NO_RESULT };
  const structure =
    input.pipeline !== undefined
      ? buildPipeline(input.pipeline, seeded)
      : (format as NonNullable<typeof format>).build(seeded, options);
  const courtIds = Array.from({ length: Math.max(0, input.courtCount) }, (_, index) => `C${index + 1}`);
  // ADR-311 — a pipeline's matches run at their stage's length; a format's at the day's.
  const stageMinutes = new Map(structure.stages.map((stage) => [stage.code, stage.matchMinutes]));
  const planned = toPlanMatches(structure, input.matchMinutes).map((match, index) => ({
    ...match,
    minutes: stageMinutes.get(structure.matches[index]?.stageCode ?? '') ?? input.matchMinutes,
  }));
  const result = plan({
    now: input.startMinute,
    courts: courtIds.map((id, index) => ({ id, label: `Court ${index + 1}` })),
    matches: planned,
    fixed: [],
    finished: [],
    changeoverMinutes: input.changeoverMinutes,
    restMinutes:
      input.pipeline !== undefined
        ? input.restMinutes
        : ((format as NonNullable<typeof format>).restPolicy.restMinutes ?? input.restMinutes),
    deadline: input.deadlineMinute,
  });
  const byCode = new Map(result.placements.map((placement) => [placement.matchId, placement]));
  return {
    error: null,
    structure,
    matches: structure.matches.map((match) => simulated(match, { placement: byCode.get(match.code), courtIds })),
    fit: result.fit,
  };
}
