import { resultAwardsFor } from './awards.js';
import { occupantsOf } from './seats.js';
import { accept, eventOf, isSuperadmin, refuse, refuseWhenClosed, takeId } from './state.js';
import type { CommandContext, CommandResult, Match, Slot, Stage, TournamentState } from './types.js';

/**
 * ADR-278 — a Swiss stage grows a round at a time, and each round's sit-out is credited with a bye.
 *
 * A bye is the format's rule "bye = walkover win": the team a round leaves out is credited a win
 * without playing. It is written as a completed match with one seat, so every table, the rematch rule
 * and "who has already had a bye" read it exactly as they read any other result, and it pays the win
 * rate as a walkover does. It holds no court and the planner never places it.
 */

export interface RoundRef {
  stageId: string;
  round: number;
}

export interface RoundEntrant extends RoundRef {
  entrantId: string;
}

/** Whether an entrant already has a place in a stage's round: a structure match, in any status. */
export function hasRoundMatch(state: TournamentState, input: RoundEntrant): boolean {
  return state.matches.some((match) => {
    if (match.stageId !== input.stageId || match.round !== input.round || match.origin !== 'structure') return false;
    const seats = occupantsOf(state, match);
    return seats.a === input.entrantId || seats.b === input.entrantId;
  });
}

function swissStage(state: TournamentState, input: { stageId: string; context: CommandContext }): Stage | CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  if (!isSuperadmin(input.context.actor)) return refuse('not_allowed', 'Only a superadmin can change a round.');
  const stage = state.stages.find((candidate) => candidate.id === input.stageId);
  if (stage === undefined || stage.status !== 'active') return refuse('wrong_status', 'That stage is not being played.');
  if (stage.kind !== 'swiss') return refuse('wrong_status', 'Only a Swiss stage is paired a round at a time.');
  return stage;
}

function isActiveEntrant(state: TournamentState, entrantId: string): boolean {
  return state.entrants.some((entrant) => entrant.id === entrantId && entrant.withdrawnAt === null);
}

function seatFor(state: TournamentState, entrantId: string): Slot {
  const name = state.entrants.find((entrant) => entrant.id === entrantId)?.name ?? 'Team';
  return { source: { kind: 'entrant', entrantId }, label: name, seatedEntrantId: entrantId, seatOverrideReason: null };
}

const BYE_SEAT: Slot = { source: { kind: 'vacant' }, label: 'Bye', seatedEntrantId: null, seatOverrideReason: null };

function nextSequence(state: TournamentState): number {
  return state.matches.reduce((highest, match) => Math.max(highest, match.sequence), 0) + 1;
}

interface RoundMatchInput extends RoundRef {
  id: string;
  code: string;
  sequence: number;
  plannedMinutes: number;
  slots: { a: Slot; b: Slot };
}

function roundMatch(input: RoundMatchInput): Match {
  return {
    id: input.id,
    code: input.code,
    stageId: input.stageId,
    groupId: null,
    round: input.round,
    sequence: input.sequence,
    origin: 'structure',
    isPlacement: false,
    status: 'scheduled',
    courtId: null,
    plannedStartAt: null,
    plannedMinutes: input.plannedMinutes,
    startedAt: null,
    endedAt: null,
    startedBy: null,
    scoreA: 0,
    scoreB: 0,
    result: null,
    isVoided: false,
    cancelReason: null,
    version: 0,
    slots: input.slots,
  };
}

/** The round's sit-out, credited with a win and paid for it: the context's first id, then one for the award. */
export function recordBye(state: TournamentState, command: RoundEntrant, context: CommandContext): CommandResult {
  const stage = swissStage(state, { stageId: command.stageId, context });
  if (!('ordinal' in stage)) return stage;
  if (!isActiveEntrant(state, command.entrantId)) return refuse('entrant_withdrawn', 'That team cannot take a bye.');
  if (hasRoundMatch(state, command)) return refuse('entrant_busy', 'That team already has a match in this round.');
  const sequence = nextSequence(state);
  const seats = { a: seatFor(state, command.entrantId), b: BYE_SEAT };
  // The schema's floor for minutes: a bye takes no court time.
  const base = roundMatch({ stageId: stage.id, round: command.round, id: takeId(context, 0), code: `BYE${sequence}`, sequence, plannedMinutes: 1, slots: seats });
  const bye: Match = { ...base, status: 'completed', startedAt: context.now, endedAt: context.now, startedBy: context.actor, result: { kind: 'bye', winnerSide: 'a' } };
  const awards = resultAwardsFor(state, { match: bye, context, firstIdIndex: 1 });
  const next = { ...state, matches: [...state.matches, bye], awards: [...state.awards, ...awards] };
  const event = eventOf(context, { kind: 'bye_recorded', matchId: bye.id, detail: { entrantId: command.entrantId, round: command.round } });
  return accept(next, [event]);
}

export interface AppendRoundCommand extends RoundRef {
  pairs: readonly (readonly [string, string])[];
  byeEntrantId: string | null;
  plannedMinutes: number;
}

function lastRoundOf(state: TournamentState, stageId: string): number {
  return state.matches.filter((match) => match.stageId === stageId).reduce((highest, match) => Math.max(highest, match.round), 0);
}

function checkPairs(state: TournamentState, command: AppendRoundCommand): CommandResult | null {
  const named = [...command.pairs.flat(), ...(command.byeEntrantId === null ? [] : [command.byeEntrantId])];
  if (command.pairs.length === 0) return refuse('wrong_status', 'There is nobody left to pair.');
  if (new Set(named).size !== named.length) return refuse('same_entrant', 'A team can play only once in a round.');
  if (!named.every((entrantId) => isActiveEntrant(state, entrantId))) return refuse('entrant_withdrawn', 'One of these teams has withdrawn.');
  return null;
}

/** The next round of a Swiss stage: its matches (one id each), then its bye when the field is odd. */
export function appendRound(state: TournamentState, command: AppendRoundCommand, context: CommandContext): CommandResult {
  const stage = swissStage(state, { stageId: command.stageId, context });
  if (!('ordinal' in stage)) return stage;
  if (command.round <= lastRoundOf(state, stage.id)) return refuse('wrong_status', 'That round has already been paired.');
  const refusal = checkPairs(state, command);
  if (refusal) return refusal;
  const first = nextSequence(state);
  const matches = command.pairs.map(([a, b], index) =>
    roundMatch({
      stageId: stage.id,
      round: command.round,
      id: takeId(context, index),
      code: `S${command.round}-${index + 1}`,
      sequence: first + index,
      plannedMinutes: command.plannedMinutes,
      slots: { a: seatFor(state, a), b: seatFor(state, b) },
    }),
  );
  const paired = { ...state, matches: [...state.matches, ...matches] };
  const event = eventOf(context, { kind: 'round_paired', detail: { stageId: stage.id, round: command.round, matches: matches.length } });
  if (command.byeEntrantId === null) return accept(paired, [event]);
  const rest = { ...context, newIds: context.newIds.slice(matches.length) };
  const bye = recordBye(paired, { stageId: stage.id, round: command.round, entrantId: command.byeEntrantId }, rest);
  return bye.ok ? accept(bye.state, [event, ...bye.events]) : bye;
}
