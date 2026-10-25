import { describePipelineFlow, type StageFlow } from '@psd/tournament/scheduler';
import type { StageDraft } from './useTournamentSetup.js';
import { pipelineProblem, specOfStages } from './useTournamentSetup.js';

/**
 * ADR-325 — the words under each stage in the builder: what it takes in, what it plays, what it
 * sends on. Read-only; the numbers are the engine's (`describePipelineFlow`, which shares the
 * validator's field sizes), so the display cannot disagree with what Start would build.
 *
 * Nothing is described until the fields parse and the engine accepts the stage: a half-typed group
 * size must never show a confident, wrong "3 groups of 3". In that state the line is the
 * validator's own sentence instead.
 */

export interface StageFlowText {
  code: string;
  ingress: string;
  shape: string;
  egress: string;
  /** Why the stage cannot be described, in the validator's or the form's words. */
  problem: string | null;
}

const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

function ingressText(flow: StageFlow): string {
  if (flow.ingress.from === 'stage') return `In: ${flow.ingress.count} from ${flow.ingress.fromStage}`;
  return `In: ${plural(flow.ingress.count, 'entered team')}`;
}

function sizeText(sizes: readonly number[]): string {
  const distinct = [...new Set(sizes)];
  return distinct.length === 1 ? `of ${distinct[0]}` : `of ${[...sizes].join(', ')}`;
}

function shapeText(flow: StageFlow): string {
  const { shape } = flow;
  if (shape.kind === 'open') return 'Open play: matches are staged by hand';
  if (shape.kind === 'pool') return `${plural(shape.groups, 'group')} ${sizeText(shape.sizes)}, ${plural(flow.matches, 'match', 'matches')}`;
  const third = shape.hasThirdPlace ? ' (with a third-place match)' : '';
  return `Knockout of ${plural(shape.rounds, 'round')}, ${plural(flow.matches, 'match', 'matches')}${third}`;
}

function egressText(flow: StageFlow): string {
  const { egress } = flow;
  if (egress.kind === 'final') return 'Out: final placings';
  const qualifiers = egress.qualifiers === 1 ? '1 group winner' : `${egress.qualifiers} group winners`;
  const fills = egress.fills > 0 ? ` + the best ${egress.fills} ${egress.fills === 1 ? 'runner-up' : 'runners-up'}` : '';
  const grouped = flow.shape.kind === 'pool' ? `${qualifiers}${fills}` : `top ${egress.count}`;
  return `Out: ${grouped}, to ${egress.toStage}`;
}

/** One line per stage; every line is the problem alone when the list does not parse or the engine refuses it. */
export function stageFlowsOf(stages: readonly StageDraft[], teamCount: number): StageFlowText[] {
  const problem = pipelineProblem(stages, teamCount);
  const flows = problem === null ? describePipelineFlow(specOfStages(stages), teamCount) : [];
  return stages.map((stage, index) => {
    const flow = flows[index];
    if (flow === undefined) {
      const own = problem !== null && problem.startsWith(`${stage.code.trim()}:`) ? problem : null;
      return { code: stage.code, ingress: '', shape: '', egress: '', problem: own ?? (index === 0 ? problem : null) };
    }
    return { code: stage.code, ingress: ingressText(flow), shape: shapeText(flow), egress: egressText(flow), problem: null };
  });
}
