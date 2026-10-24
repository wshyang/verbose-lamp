import { resultAwardsFor } from './awards.js';
import { freezeSlot, occupantsOf } from './seats.js';
import {
  accept,
  cleanReason,
  eventOf,
  findMatchById,
  isSuperadmin,
  refuse,
  refuseWhenClosed,
  refuseWhenPaused,
  takeId,
  withMatch,
} from './state.js';
import type { CommandContext, CommandResult, Match, Side, Slot, TournamentState } from './types.js';

/**
 * ADR-273 §3 — a match's life on the sand: start, score, complete, cancel, and the ad-hoc match a
 * facilitator stages by hand. Every function is a pure decision over a state value.
 *
 * The score is the result (ADR-114, kept): the marshal moves it a rally at a time, and completing
 * reads the winner off it. A level score is a draw where the stage allows draws; in a bracket a
 * level score with points on the board means "play on", and 0 - 0 names nobody so a person must.
 */

function liveEntrantIds(state: TournamentState): Set<string> {
  const ids = new Set<string>();
  for (const match of state.matches) {
    if (match.status !== 'in_progress') continue;
    for (const side of ['a', 'b'] as const) {
      const seated = match.slots[side].seatedEntrantId;
      if (seated !== null) ids.add(seated);
    }
  }
  return ids;
}

function checkCourt(state: TournamentState, courtId: string): CommandResult | null {
  const court = state.courts.find((candidate) => candidate.id === courtId);
  if (court === undefined || !court.isEnabled) return refuse('court_unavailable', 'That court is not available.');
  const busy = state.matches.some((match) => match.status === 'in_progress' && match.courtId === courtId);
  if (busy) return refuse('court_busy', 'A match is already being played on that court.');
  return null;
}

function checkEntrants(state: TournamentState, seats: { a: string | null; b: string | null }): CommandResult | null {
  if (seats.a === null || seats.b === null) return refuse('seat_unresolved', 'Both teams of this match are not known yet.');
  if (seats.a === seats.b) return refuse('same_entrant', 'Both seats name the same team.');
  const withdrawn = new Set(state.entrants.filter((entrant) => entrant.withdrawnAt !== null).map((entrant) => entrant.id));
  if (withdrawn.has(seats.a) || withdrawn.has(seats.b)) return refuse('entrant_withdrawn', 'One of these teams has withdrawn.');
  const live = liveEntrantIds(state);
  if (live.has(seats.a) || live.has(seats.b)) return refuse('entrant_busy', 'One of these teams is already playing.');
  return null;
}

/**
 * ADR-325 — a stage fed by an earlier one plays only the teams that came through it. Before the
 * feeder closes nobody has, so the answer is "not yet" rather than "not you"; once it has, a team
 * outside the frozen roster is refused. A stage with no intake accepts any two teams, as before.
 */
function checkRoster(state: TournamentState, input: { stageId: string; entrantIds: readonly string[] }): CommandResult | null {
  const stage = state.stages.find((candidate) => candidate.id === input.stageId);
  if (stage === undefined || stage.intake === null || stage.kind !== 'open') return null;
  if (stage.roster.length === 0) return refuse('stage_not_fed', 'The previous stage is still being played, so no team has come through to this one yet.');
  const outsiders = input.entrantIds.filter((id) => !stage.roster.includes(id));
  if (outsiders.length > 0) return refuse('not_in_stage', 'A team that did not come through the previous stage cannot play in this one.');
  return null;
}

function activateStageOf(state: TournamentState, match: Match): TournamentState {
  const stages = state.stages.map((stage) =>
    stage.id === match.stageId && stage.status === 'pending' ? { ...stage, status: 'active' as const } : stage,
  );
  return { ...state, stages };
}

function startable(state: TournamentState, matchId: string): Match | CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  // ADR-336 — the one thing a pause forbids. Every route that starts a match comes through here:
  // startMatch directly, and startPair through the queued match it claims.
  const paused = refuseWhenPaused(state);
  if (paused) return paused;
  const match = findMatchById(state, matchId);
  if (match === undefined) return refuse('not_found', 'No such match.');
  if (match.status !== 'scheduled') return refuse('wrong_status', 'Only a scheduled match can start.');
  const stage = state.stages.find((candidate) => candidate.id === match.stageId);
  if (stage?.status === 'completed') return refuse('wrong_status', 'That stage is already over.');
  return match;
}

/** Requirement 1 — two teams on a court. Seats are frozen here: from now on the match is history. */
export function startMatch(
  state: TournamentState,
  command: { matchId: string; courtId: string },
  context: CommandContext,
): CommandResult {
  const match = startable(state, command.matchId);
  if (!('slots' in match)) return match;
  const refusal = checkCourt(state, command.courtId) ?? checkEntrants(state, occupantsOf(state, match));
  if (refusal) return refusal;
  const started: Match = {
    ...match,
    status: 'in_progress',
    courtId: command.courtId,
    startedAt: context.now,
    startedBy: context.actor,
    scoreA: 0,
    scoreB: 0,
    version: match.version + 1,
    slots: { a: freezeSlot(state, match.slots.a), b: freezeSlot(state, match.slots.b) },
  };
  const next = activateStageOf(withMatch(state, started), started);
  return accept(next, [eventOf(context, { kind: 'match_started', matchId: match.id, detail: { courtId: command.courtId } })]);
}

function entrantSlot(state: TournamentState, entrantId: string): Slot {
  const name = state.entrants.find((entrant) => entrant.id === entrantId)?.name ?? 'Team';
  return { source: { kind: 'entrant', entrantId }, label: name, seatedEntrantId: entrantId, seatOverrideReason: null };
}

function adHocStage(state: TournamentState): string | null {
  const active = state.stages.find((stage) => stage.status === 'active');
  if (active) return active.id;
  return state.stages.find((stage) => stage.status === 'pending')?.id ?? null;
}

export interface StageAdHocCommand {
  courtId: string;
  entrantAId: string;
  entrantBId: string;
  plannedMinutes: number;
}

function adHocMatch(state: TournamentState, input: { command: StageAdHocCommand; stageId: string; id: string; now: string }): Match {
  const sequence = state.matches.reduce((highest, match) => Math.max(highest, match.sequence), 0) + 1;
  return {
    id: input.id,
    code: `M${sequence}`,
    stageId: input.stageId,
    groupId: null,
    round: 1,
    sequence,
    origin: 'ad_hoc',
    isPlacement: false,
    status: 'scheduled',
    courtId: input.command.courtId,
    plannedStartAt: input.now,
    plannedMinutes: input.command.plannedMinutes,
    startedAt: null,
    endedAt: null,
    startedBy: null,
    scoreA: 0,
    scoreB: 0,
    result: null,
    isVoided: false,
    cancelReason: null,
    version: 0,
    slots: { a: entrantSlot(state, input.command.entrantAId), b: entrantSlot(state, input.command.entrantBId) },
  };
}

/** Any two teams, by hand (P-05): it counts exactly as much as a match the scheduler planned. */
export function stageAdHocMatch(state: TournamentState, command: StageAdHocCommand, context: CommandContext): CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  // ADR-336 — checked here as well as in `startable`, so a paused day refuses the ad-hoc match
  // itself rather than staging one and refusing to start it: a refused command writes nothing.
  const paused = refuseWhenPaused(state);
  if (paused) return paused;
  const stageId = adHocStage(state);
  if (stageId === null) return refuse('wrong_status', 'There is no stage left to play a match in.');
  const refusal =
    checkCourt(state, command.courtId) ??
    checkEntrants(state, { a: command.entrantAId, b: command.entrantBId }) ??
    checkRoster(state, { stageId, entrantIds: [command.entrantAId, command.entrantBId] });
  if (refusal) return refusal;
  const match = adHocMatch(state, { command, stageId, id: takeId(context, 0), now: context.now });
  const staged = { ...state, matches: [...state.matches, match] };
  const event = eventOf(context, { kind: 'match_staged', matchId: match.id, detail: { courtId: command.courtId } });
  const started = startMatch(staged, { matchId: match.id, courtId: command.courtId }, { ...context, newIds: [] });
  return started.ok ? accept(started.state, [event, ...started.events]) : started;
}

export interface ScoreStepCommand {
  matchId: string;
  side: Side;
  from: number;
  to: number;
}

/** Requirement 2 — one rally, one tap, compare-and-set against the score the marshal could see. */
export function scoreStep(state: TournamentState, command: ScoreStepCommand, context: CommandContext): CommandResult {
  const match = findMatchById(state, command.matchId);
  if (match === undefined) return refuse('not_found', 'No such match.');
  if (match.status !== 'in_progress') return refuse('wrong_status', 'Only a live match can be scored.');
  if (Math.abs(command.to - command.from) !== 1 || command.to < 0) return refuse('bad_step', 'A score moves one point at a time.');
  const current = command.side === 'a' ? match.scoreA : match.scoreB;
  // A retry or a bounced thumb: already where the marshal wants it, so a success with nothing to do.
  if (current === command.to) return accept(state, []);
  if (current !== command.from) return refuse('stale_score', 'The score moved since this screen last looked. Refresh.');
  const scored: Match = {
    ...match,
    scoreA: command.side === 'a' ? command.to : match.scoreA,
    scoreB: command.side === 'b' ? command.to : match.scoreB,
    version: match.version + 1,
  };
  const event = eventOf(context, { kind: 'match_scored', matchId: match.id, detail: { scoreA: scored.scoreA, scoreB: scored.scoreB } });
  return accept(withMatch(state, scored), [event]);
}

export type OutcomeMode = 'win' | 'draw' | 'overtime' | 'untracked';

/** What a score means for a match in this stage — the same four words the court console reads. */
export function readOutcome(input: { scoreA: number; scoreB: number; allowsDraws: boolean }): { mode: OutcomeMode; winnerSide: Side | null } {
  if (input.scoreA !== input.scoreB) return { mode: 'win', winnerSide: input.scoreA > input.scoreB ? 'a' : 'b' };
  if (input.allowsDraws) return { mode: 'draw', winnerSide: null };
  return { mode: input.scoreA === 0 ? 'untracked' : 'overtime', winnerSide: null };
}

export function stageAllowsDraws(state: TournamentState, match: Match): boolean {
  return state.stages.find((stage) => stage.id === match.stageId)?.allowsDraws ?? true;
}

export type WinnerDecision = { winnerSide: Side | null } | { refusal: CommandResult };

/** ADR-329 F5 — how a level knockout was settled off the scoreboard, when it was. */
export type TiebreakMethod = 'coin_toss' | 'rock_paper_scissors';

/** Decides the winner side for a finish: from the score, or named when 0 - 0 in a bracket. */
export function decideWinner(
  state: TournamentState,
  input: { match: Match; scoreA: number; scoreB: number; namedWinner: Side | null; tiebreakMethod?: TiebreakMethod | null },
): WinnerDecision {
  const outcome = readOutcome({ scoreA: input.scoreA, scoreB: input.scoreB, allowsDraws: stageAllowsDraws(state, input.match) });
  const method = input.tiebreakMethod ?? null;
  if (outcome.mode === 'overtime') {
    // Level with points on the board: play on, unless a person settles it by toss or scissors-paper-stone.
    if (method === null) return { refusal: refuse('play_on', 'Level in a match that must have a winner: play on.') };
    if (input.namedWinner === null) {
      return { refusal: refuse('winner_required', 'Name the team that won the tiebreak.') };
    }
    return { winnerSide: input.namedWinner };
  }
  if (method !== null && outcome.mode !== 'untracked') {
    return { refusal: refuse('tiebreak_not_needed', 'The score already settles this match; no tiebreak is needed.') };
  }
  if (outcome.mode === 'untracked') {
    if (input.namedWinner === null) {
      return { refusal: refuse('winner_required', 'Name the winner: nothing was scored and this match cannot be drawn.') };
    }
    return { winnerSide: input.namedWinner };
  }
  if (input.namedWinner !== null && input.namedWinner !== outcome.winnerSide) {
    return { refusal: refuse('winner_required', 'The winner must be the team the score says won.') };
  }
  return { winnerSide: outcome.winnerSide };
}

/** Requirement 3 — the match is over, and the result is the score (ADR-114). Result awards are paid. */
export function completeMatch(
  state: TournamentState,
  command: { matchId: string; namedWinner: Side | null; tiebreakMethod?: TiebreakMethod | null },
  context: CommandContext,
): CommandResult {
  const match = findMatchById(state, command.matchId);
  if (match === undefined) return refuse('not_found', 'No such match.');
  if (match.status !== 'in_progress') return refuse('wrong_status', 'Only a live match can be completed.');
  const decided = decideWinner(state, {
    match,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    namedWinner: command.namedWinner,
    tiebreakMethod: command.tiebreakMethod ?? null,
  });
  if ('refusal' in decided) return decided.refusal;
  const completed: Match = {
    ...match,
    status: 'completed',
    endedAt: context.now,
    result: { kind: 'score', winnerSide: decided.winnerSide },
    version: match.version + 1,
  };
  const awards = resultAwardsFor(state, { match: completed, context, firstIdIndex: 0 });
  const next = { ...withMatch(state, completed), awards: [...state.awards, ...awards] };
  const method = command.tiebreakMethod ?? null;
  const event = eventOf(context, {
    kind: 'match_completed',
    matchId: match.id,
    detail: method === null ? { winnerSide: decided.winnerSide } : { winnerSide: decided.winnerSide, tiebreakMethod: method },
  });
  return accept(next, [event]);
}

/**
 * ADR-329 F4 — a match other matches still read a winner or loser from, through a seat
 * nobody has frozen yet. Cancelling it would leave that seat reading a match that can
 * never produce anybody, and the dependant could neither start nor take a walkover.
 */
export function hasUnseatedDependents(state: TournamentState, matchId: string): boolean {
  return state.matches.some(
    (other) =>
      other.id !== matchId &&
      (['a', 'b'] as const).some((side) => {
        const slot = other.slots[side];
        return (
          slot.seatedEntrantId === null &&
          (slot.source.kind === 'winner_of' || slot.source.kind === 'loser_of') &&
          slot.source.matchId === matchId
        );
      }),
  );
}

/** F24 — called off: the starter or a superadmin. A superadmin must say why (Q3). */
export function cancelMatch(
  state: TournamentState,
  command: { matchId: string; reason: string | null },
  context: CommandContext,
): CommandResult {
  const match = findMatchById(state, command.matchId);
  if (match === undefined) return refuse('not_found', 'No such match.');
  if (match.status !== 'in_progress' && match.status !== 'scheduled') {
    return refuse('wrong_status', 'Only a scheduled or live match can be called off.');
  }
  const isStarter = match.startedBy !== null && match.startedBy.id === context.actor.id;
  if (!isSuperadmin(context.actor) && !isStarter) return refuse('not_allowed', 'Only the facilitator who started it can cancel this match.');
  const reason = cleanReason(command.reason);
  if (isSuperadmin(context.actor) && reason === null) return refuse('reason_required', 'Say why this match is called off.');
  if (hasUnseatedDependents(state, match.id)) {
    return refuse('has_dependents', 'A match waiting on this winner or loser has nobody in that seat yet.');
  }
  const cancelled: Match = { ...match, status: 'cancelled', endedAt: context.now, cancelReason: reason, version: match.version + 1 };
  return accept(withMatch(state, cancelled), [eventOf(context, { kind: 'match_cancelled', matchId: match.id, reason })]);
}

/**
 * F24 for a match the schedule owed — the claim undone (ADR-277). A marshal who started the wrong
 * pair cancels, and the matchup is still owed, so the match goes back in the queue rather than out
 * of the day: its seats stay frozen, its court and time are the planner's again. An ad-hoc match has
 * no queue to go back to and is cancelled instead.
 */
export function releaseMatch(state: TournamentState, command: { matchId: string }, context: CommandContext): CommandResult {
  const match = findMatchById(state, command.matchId);
  if (match === undefined) return refuse('not_found', 'No such match.');
  if (match.status !== 'in_progress') return refuse('wrong_status', 'Only a live match can be handed back.');
  if (match.origin !== 'structure') return refuse('wrong_status', 'An ad-hoc match is cancelled, not handed back.');
  const isStarter = match.startedBy !== null && match.startedBy.id === context.actor.id;
  if (!isSuperadmin(context.actor) && !isStarter) return refuse('not_allowed', 'Only the facilitator who started it can hand this match back.');
  const released: Match = { ...match, status: 'scheduled', startedAt: null, startedBy: null, scoreA: 0, scoreB: 0, version: match.version + 1 };
  return accept(withMatch(state, released), [eventOf(context, { kind: 'match_released', matchId: match.id })]);
}
