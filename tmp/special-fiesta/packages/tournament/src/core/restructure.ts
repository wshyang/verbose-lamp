import { accept, cleanReason, eventOf, isSuperadmin, refuse, refuseWhenClosed } from './state.js';
import type { CommandContext, CommandResult, Group, Match, Stage, TournamentState } from './types.js';

/**
 * ADR-329 F12 — the core's restage primitive. The scheduler owns every format rule and
 * builds the replacement; this command is format-blind: it swaps an unstarted, unfed
 * stage's groups and fixtures for a well-formed fragment, supersedes what it replaces
 * (never deletes), and writes one attributable event. "Started" is measured on matches,
 * not `stage.status`, because the next stage turns active the moment its feeder closes.
 */

export interface StageFragment {
  stageId: string;
  patch: Pick<Stage, 'advanceCount' | 'rates' | 'tablePoints' | 'intake' | 'kind' | 'allowsDraws'>;
  groups: readonly Group[];
  matches: readonly Match[];
}

export interface RestructureStagesCommand {
  fragments: readonly StageFragment[];
  reason: string;
}

function hasStarted(matches: readonly Match[]): boolean {
  return matches.some((match) => match.startedAt !== null || match.status === 'in_progress' || match.status === 'completed');
}

function sourceReadsStage(source: Match['slots']['a']['source'], target: { stageId: string; groupIds: Set<string>; matchIds: Set<string> }): boolean {
  if (source.kind === 'stage_place') return source.stageId === target.stageId;
  if (source.kind === 'group_place') return target.groupIds.has(source.groupId);
  if (source.kind === 'winner_of' || source.kind === 'loser_of') return target.matchIds.has(source.matchId);
  return false;
}

/** The stages that read a target: fed by it, or holding a seat that reads its places, groups or matches. */
function readersOf(state: TournamentState, stageId: string): Set<string> {
  const target = {
    stageId,
    groupIds: new Set(state.groups.filter((group) => group.stageId === stageId).map((group) => group.id)),
    matchIds: new Set(state.matches.filter((match) => match.stageId === stageId).map((match) => match.id)),
  };
  const readers = new Set<string>();
  for (const stage of state.stages) {
    if (stage.intake?.fromStageId === stageId) readers.add(stage.id);
  }
  for (const match of state.matches) {
    const reads = (['a', 'b'] as const).some((side) => sourceReadsStage(match.slots[side].source, target));
    if (reads) readers.add(match.stageId);
  }
  return readers;
}

function checkFragmentShape(state: TournamentState, fragment: StageFragment): CommandResult | null {
  for (const group of fragment.groups) {
    if (group.stageId !== fragment.stageId) return refuse('bad_step', 'A fragment group belongs to another stage.');
    if (group.entrantIds.some((entrantId) => !state.entrants.some((entrant) => entrant.id === entrantId))) {
      return refuse('not_found', 'A fragment group names a team that is not in the tournament.');
    }
  }
  const groupIds = new Set(fragment.groups.map((group) => group.id));
  for (const match of fragment.matches) {
    if (match.stageId !== fragment.stageId) return refuse('bad_step', 'A fragment match belongs to another stage.');
    if (match.status !== 'scheduled') return refuse('wrong_status', 'A fragment match must not have started.');
    if (match.groupId !== null && !groupIds.has(match.groupId)) return refuse('bad_step', 'A fragment match names a group outside the fragment.');
  }
  return null;
}

/** Every seat in the resulting state must still name something that exists and is not superseded. */
interface LiveSets {
  matches: Set<string>;
  groups: Set<string>;
  stages: Set<string>;
  entrants: Set<string>;
}

function sourceDangles(source: Match['slots']['a']['source'], live: LiveSets): boolean {
  if (source.kind === 'entrant') return !live.entrants.has(source.entrantId);
  if (source.kind === 'winner_of' || source.kind === 'loser_of') return !live.matches.has(source.matchId);
  if (source.kind === 'group_place') return !live.groups.has(source.groupId);
  if (source.kind === 'stage_place' || source.kind === 'pairing') return !live.stages.has(source.stageId);
  return false;
}

/** The winner graph must not cycle: a fixture cannot wait on itself, however long the chain. */
function winnerGraphCycles(matches: readonly Match[]): boolean {
  const edges = new Map<string, string[]>();
  for (const match of matches) {
    if (match.status === 'superseded') continue;
    edges.set(
      match.id,
      (['a', 'b'] as const)
        .map((side) => match.slots[side].source)
        .filter((source) => source.kind === 'winner_of' || source.kind === 'loser_of')
        .map((source) => (source as { matchId: string }).matchId),
    );
  }
  const done = new Set<string>();
  const visit = (id: string, trail: Set<string>): boolean => {
    if (trail.has(id)) return true;
    if (done.has(id)) return false;
    done.add(id);
    return (edges.get(id) ?? []).some((read) => visit(read, new Set(trail).add(id)));
  };
  return [...edges.keys()].some((id) => visit(id, new Set()));
}

function checkResultingState(next: TournamentState): CommandResult | null {
  const live: LiveSets = {
    matches: new Set(next.matches.filter((match) => match.status !== 'superseded').map((match) => match.id)),
    groups: new Set(next.groups.map((group) => group.id)),
    stages: new Set(next.stages.map((stage) => stage.id)),
    entrants: new Set(next.entrants.map((entrant) => entrant.id)),
  };
  for (const match of next.matches) {
    if (match.status === 'superseded') continue;
    const dangles = (['a', 'b'] as const).some((side) => sourceDangles(match.slots[side].source, live));
    if (dangles) return refuse('has_dependents', 'Another match still reads a fixture or group this change replaces.');
  }
  if (winnerGraphCycles(next.matches)) return refuse('bad_step', 'The fixtures wait on each other in a circle.');
  return null;
}

/** One fragment's gate: the stage exists, nothing in it has started, it has not been fed, and no started stage reads it. */
function checkTarget(state: TournamentState, fragment: StageFragment, fragmentStageIds: Set<string>): CommandResult | null {
  const stage = state.stages.find((candidate) => candidate.id === fragment.stageId);
  if (stage === undefined) return refuse('not_found', 'No such stage.');
  if (hasStarted(state.matches.filter((match) => match.stageId === stage.id))) {
    return refuse('stage_started', 'That stage has a match that has started or finished.');
  }
  if (stage.roster.length > 0) return refuse('stage_fed', 'That stage has already been fed its teams.');
  const startedReader = [...readersOf(state, stage.id)].some(
    (readerId) =>
      !fragmentStageIds.has(readerId) && readerId !== stage.id && hasStarted(state.matches.filter((match) => match.stageId === readerId)),
  );
  if (startedReader) return refuse('stage_started', 'A stage that reads this one has already started.');
  return checkFragmentShape(state, fragment);
}

export function restructureStages(state: TournamentState, command: RestructureStagesCommand, context: CommandContext): CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  if (!isSuperadmin(context.actor)) return refuse('not_allowed', 'Only a superadmin can restage a stage.');
  const reason = cleanReason(command.reason);
  if (reason === null) return refuse('reason_required', 'Say why the stage is being rebuilt.');
  if (command.fragments.length === 0) return refuse('bad_step', 'Name at least one stage to rebuild.');

  const fragmentStageIds = new Set(command.fragments.map((fragment) => fragment.stageId));
  for (const fragment of command.fragments) {
    const gate = checkTarget(state, fragment, fragmentStageIds);
    if (gate !== null) return gate;
  }

  const stages = state.stages.map((stage) => {
    const fragment = command.fragments.find((candidate) => candidate.stageId === stage.id);
    return fragment === undefined ? stage : { ...stage, ...fragment.patch };
  });
  const groups = [
    ...state.groups.filter((group) => !fragmentStageIds.has(group.stageId)),
    ...command.fragments.flatMap((fragment) => fragment.groups),
  ];
  const kept = state.matches.filter((match) => !fragmentStageIds.has(match.stageId));
  const superseded = state.matches
    .filter((match) => fragmentStageIds.has(match.stageId))
    .map((match) => ({ ...match, status: 'superseded' as const, version: match.version + 1 }));
  const fresh = command.fragments.flatMap((fragment) => fragment.matches);
  const next: TournamentState = { ...state, stages, groups, matches: [...kept, ...superseded, ...fresh] };
  const dangling = checkResultingState(next);
  if (dangling !== null) return dangling;
  const event = eventOf(context, {
    kind: 'stage_restructured',
    reason,
    detail: { stages: command.fragments.length, matches: fresh.length },
  });
  return accept(next, [event]);
}
