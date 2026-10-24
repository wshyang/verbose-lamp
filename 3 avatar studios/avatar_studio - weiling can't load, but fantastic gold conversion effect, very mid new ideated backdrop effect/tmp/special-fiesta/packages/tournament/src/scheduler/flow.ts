import { nextPowerOfTwo } from './formats/common.js';
import { groupCountFor } from './formats/stages.js';
import { fieldOfStage, poolQualifierCount, validatePipeline, type PipelineSpec, type StageSpec } from './pipeline.js';

/**
 * ADR-325 — what each stage of a pipeline takes in and sends on, derived from the spec alone.
 *
 * The stage builder shows this read-only beside each stage, so the person configuring a day can see
 * "9 teams in, three groups of three, nine matches, three winners and the best runner-up out" before
 * anything is built. It is computed here, from the same field sizes the validator uses, rather than
 * in the browser, so the display and the validator cannot disagree about how many teams a stage has.
 *
 * A stage that cannot be described carries `problem`, which is the validator's own sentence for it.
 */

export type StageShape =
  | { kind: 'pool'; groups: number; sizes: number[] }
  | { kind: 'bracket'; rounds: number; hasThirdPlace: boolean }
  | { kind: 'open' };

export interface StageIngress {
  count: number;
  /** `entered`: the teams entered for the day. `stage`: the best finishers of an earlier stage. */
  from: 'entered' | 'stage';
  fromStage?: string | undefined;
}

export type StageEgress =
  /** Teams sent on to a later stage: how many, split into per-group qualifiers and shortfall fills. */
  | { kind: 'advancers'; count: number; qualifiers: number; fills: number; toStage: string }
  /** Nobody reads from this stage: its table is the result. */
  | { kind: 'final' };

export interface StageFlow {
  code: string;
  label: string;
  ingress: StageIngress;
  shape: StageShape;
  matches: number;
  egress: StageEgress;
  /** Why this stage cannot be described, in the validator's words; absent when it can. */
  problem?: string | undefined;
}

/** Group sizes the snake deal produces: the first `remainder` groups hold one more team. */
function groupSizes(teams: number, groups: number): number[] {
  const base = Math.floor(teams / groups);
  const extra = teams % groups;
  return Array.from({ length: groups }, (_, index) => base + (index < extra ? 1 : 0));
}

const roundRobin = (teams: number): number => (teams * (teams - 1)) / 2;

/** Matches and rounds of a single-elimination bracket over `teams` seats, byes being structure, not matches. */
function bracketShape(input: { teams: number; hasThirdPlace: boolean }): { rounds: number; matches: number } {
  const { teams, hasThirdPlace } = input;
  if (teams < 2) return { rounds: 0, matches: 0 };
  const size = nextPowerOfTwo(teams);
  const rounds = Math.log2(size);
  const thirdPlace = hasThirdPlace && size >= 4 ? 1 : 0;
  return { rounds, matches: teams - 1 + thirdPlace };
}

function shapeOf(spec: StageSpec, field: number): { shape: StageShape; matches: number } {
  const options = spec.options ?? {};
  if (spec.format === 'open') return { shape: { kind: 'open' }, matches: 0 };
  if (spec.format === 'pool') {
    const groups = groupCountFor(field, options);
    const sizes = groupSizes(field, groups);
    return { shape: { kind: 'pool', groups, sizes }, matches: sizes.reduce((sum, size) => sum + roundRobin(size), 0) };
  }
  const hasThirdPlace = options.hasThirdPlace ?? false;
  const { rounds, matches } = bracketShape({ teams: field, hasThirdPlace });
  return { shape: { kind: 'bracket', rounds, hasThirdPlace: hasThirdPlace && field >= 4 }, matches };
}

/** The first later stage that takes teams from `code`, or null when nothing does. */
function consumerOf(spec: PipelineSpec, code: string): StageSpec | null {
  return spec.stages.find((stage) => stage.source.kind === 'advancers' && stage.source.fromStage === code) ?? null;
}

/** Per-group qualifiers a pool sends on by its own rule, whatever the next stage asks for. */
function qualifiersOf(spec: StageSpec, teamCount: number): number {
  return spec.format === 'pool' ? poolQualifierCount(spec, teamCount) : 0;
}

function egressOf(input: { spec: StageSpec; pipeline: PipelineSpec; field: number; teamCount: number }): StageEgress {
  const consumer = consumerOf(input.pipeline, input.spec.code);
  if (consumer === null || consumer.source.kind !== 'advancers') return { kind: 'final' };
  const count = Math.min(consumer.source.count, input.field);
  const qualifiers = Math.min(qualifiersOf(input.spec, input.teamCount), count);
  return { kind: 'advancers', count, qualifiers, fills: count - qualifiers, toStage: consumer.code };
}

/** The stages' flows, in order. A stage the validator refuses is described as far as it can be, with its `problem`. */
export function describePipelineFlow(spec: PipelineSpec, teamCount: number): StageFlow[] {
  const refusal = validatePipeline(spec, teamCount);
  return spec.stages.map((stage) => {
    const field = fieldOfStage(stage, teamCount);
    const { shape, matches } = shapeOf(stage, field);
    const ingress: StageIngress =
      stage.source.kind === 'advancers'
        ? { count: field, from: 'stage', fromStage: stage.source.fromStage }
        : { count: field, from: 'entered' };
    const problem = refusal !== null && refusal.startsWith(`${stage.code}:`) ? refusal : undefined;
    return { code: stage.code, label: stage.label, ingress, shape, matches, egress: egressOf({ spec: stage, pipeline: spec, field, teamCount }), problem };
  });
}
