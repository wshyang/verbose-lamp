import { freezeSlot } from './seats.js';
import { advancersRanked, downstreamIntake, groupStandings, groupWinnersRanked, stageAdvancers, stageStandings, type StandingRow } from './standings.js';
import { accept, cleanReason, eventOf, isSuperadmin, refuse, refuseWhenClosed } from './state.js';
import type { CommandContext, CommandResult, Group, Match, Slot, Stage, TournamentEvent, TournamentState } from './types.js';

/**
 * ADR-273 §3 — requirement 5: advancing the day's stage, as an attributable decision (P-11).
 *
 * Nothing plays an elimination match on the strength of an unfinished table: a stage completes only
 * when every match in it is finished or called off. Completing seats every slot downstream that reads
 * a place from it, so the forecast ("Winner of Group A") becomes a person — and from then on later
 * corrections move the table, not the person. The desk may seat somebody the table did not choose,
 * with a reason (`overrides`). The scheduler may complete a stage on its own only when no tie
 * straddles a cut line: a tie the arbitrary rung separates is the desk's to call, not the clock's.
 */

function isStageMatchOpen(match: Match): boolean {
  return match.status === 'scheduled' || match.status === 'in_progress';
}

function isLevel(left: StandingRow, right: StandingRow): boolean {
  return left.points === right.points && left.difference === right.difference && left.scored === right.scored;
}

/** Whether two rows either side of a cut are level on everything but the arbitrary rung. */
function tieAtCut(table: readonly StandingRow[], cut: number): string | null {
  const lastIn = table[cut - 1];
  const firstOut = table[cut];
  if (lastIn === undefined || firstOut === undefined || !isLevel(lastIn, firstOut)) return null;
  return `${lastIn.name} / ${firstOut.name}`;
}

/** Whether a tie sits on any cut line of the stage, named for the refusal. */
function cutLineTies(state: TournamentState, stage: Stage): string[] {
  const groups = state.groups.filter((group) => group.stageId === stage.id);
  const tables: StandingRow[][] = groups.map((group) => groupStandings(state, group));
  if (tables.length === 0) tables.push(stageStandings(state, stage));
  const ties: string[] = [];
  for (const table of tables) {
    const tie = tieAtCut(table, stage.advanceCount);
    if (tie !== null) ties.push(tie);
  }
  // ADR-320 — the reconciled cut: qualifiers first, then shortfall fills, so a tie for
  // the LAST seat the next stage takes (e.g. best runner-up for a 4-team semi-final fed
  // by three group winners) is the desk's to call, exactly like a tie on a group cut.
  const intake = downstreamIntake(state, stage);
  if (intake > 0) {
    const field = groups.length > 0 ? advancersRanked(state, stage) : stageStandings(state, stage);
    const tie = tieAtCut(field, intake);
    if (tie !== null && !ties.includes(tie)) ties.push(tie);
  }
  return ties;
}

function readsFromStage(state: TournamentState, input: { slot: Slot; stage: Stage }): boolean {
  const { source } = input.slot;
  if (source.kind === 'stage_place') return source.stageId === input.stage.id;
  if (source.kind !== 'group_place') return false;
  return state.groups.some((group) => group.id === source.groupId && group.stageId === input.stage.id);
}

/**
 * ADR-329 F2 — an override is spoken one of two ways: by seat ("this fixture seat, this
 * team"), the original form, or by place ("whoever takes place N, this team instead").
 * The place form exists for a fed open stage, which has no fixtures whose seats could be
 * named; both forms mean the same thing once the place is known.
 */
export type StageOverride =
  | { matchId: string; side: 'a' | 'b'; entrantId: string }
  | { place: number; entrantId: string };

interface SeatInput {
  stage: Stage;
  overrides: readonly StageOverride[];
  reason: string | null;
}

/**
 * ADR-325 — an override is spoken as "this seat, this team" but means "this PLACE, this team". A
 * place can be read by more than one fixture (a pool's round robin reads each place twice), and
 * seating the team in one of them and the table's choice in the other would put two different
 * teams in one group seat. So the override is widened to the place it overrules: every scheduled
 * slot that reads the same `stage_place` of the closing stage gets the same person.
 */
/** The place an override speaks for in a closing stage: its own, for the place form; its seat's source's, for the seat form. */
function placeOfOverride(state: TournamentState, override: StageOverride, stageId: string): number | null {
  if ('place' in override) return override.place;
  const source = state.matches.find((candidate) => candidate.id === override.matchId)?.slots[override.side].source;
  return source !== undefined && source.kind === 'stage_place' && source.stageId === stageId ? source.place : null;
}

function placeOverridden(state: TournamentState, input: { slot: Slot; stage: Stage; overrides: readonly StageOverride[] }): StageOverride | undefined {
  const { source } = input.slot;
  if (source.kind !== 'stage_place' || source.stageId !== input.stage.id) return undefined;
  return input.overrides.find((override) => placeOfOverride(state, override, input.stage.id) === source.place);
}

function seatSide(state: TournamentState, input: SeatInput & { match: Match; side: 'a' | 'b' }): Slot {
  const slot = input.match.slots[input.side];
  if (!readsFromStage(state, { slot, stage: input.stage })) return slot;
  const direct = input.overrides.find((row) => 'matchId' in row && row.matchId === input.match.id && row.side === input.side);
  const override = direct ?? placeOverridden(state, { slot, stage: input.stage, overrides: input.overrides });
  if (override !== undefined) return { ...slot, seatedEntrantId: override.entrantId, seatOverrideReason: input.reason };
  return freezeSlot(state, slot);
}

function seatDownstream(state: TournamentState, input: SeatInput): Match[] {
  return state.matches.map((match) => {
    if (match.status !== 'scheduled') return match;
    return {
      ...match,
      slots: { a: seatSide(state, { ...input, match, side: 'a' }), b: seatSide(state, { ...input, match, side: 'b' }) },
    };
  });
}

/** The entrants a group's seats name, in the order the seats were dealt; null while any seat is unfilled. */
function membersOfSeats(state: TournamentState, group: Group): string[] | null {
  const seats = new Map<string, string>();
  for (const match of state.matches.filter((row) => row.groupId === group.id)) {
    for (const side of ['a', 'b'] as const) {
      const slot = match.slots[side];
      const key = slot.source.kind === 'stage_place' ? `place:${slot.source.place}` : slot.label;
      if (slot.seatedEntrantId !== null) seats.set(key, slot.seatedEntrantId);
      else if (slot.source.kind === 'stage_place') return null;
    }
  }
  return [...seats.entries()]
    .sort(([left], [right]) => Number(left.split(':')[1]) - Number(right.split(':')[1]))
    .map(([, entrantId]) => entrantId);
}

/**
 * ADR-325 — a pool dealt as seats has no members until the stage feeding it closes. Once its seats
 * are frozen, the group's membership is exactly the people in them. Only empty groups are filled,
 * and only when every seat has a person; a group that already has members is somebody's decision.
 */
function fillFedGroups(state: TournamentState): TournamentState {
  const groups = state.groups.map((group) => {
    if (group.entrantIds.length > 0) return group;
    const members = membersOfSeats(state, group);
    return members === null || members.length === 0 ? group : { ...group, entrantIds: members };
  });
  return { ...state, groups };
}

/**
 * ADR-325 — a stage fed by the one that just closed learns who came through: the first `count`
 * advancers in advancer order, with a desk override (a place spoken for a named team) applied to
 * the place it overruled. Frozen here, once, for the same reason seats are: a later correction
 * moves a table, not the people already sent on.
 */
function rosterFor(state: TournamentState, input: { fed: Stage; closing: Stage; overrides: readonly StageOverride[] }): string[] {
  const count = input.fed.intake?.count ?? 0;
  const places = stageAdvancers(state, input.closing, count).map((advancer) => advancer.row.entrantId);
  const overridden = new Map<number, string>();
  for (const override of input.overrides) {
    const place = placeOfOverride(state, override, input.closing.id);
    if (place !== null) overridden.set(place, override.entrantId);
  }
  return places.map((entrant, index) => overridden.get(index + 1) ?? entrant);
}

function feedRosters(state: TournamentState, input: { closing: Stage; overrides: readonly StageOverride[] }): TournamentState {
  const stages = state.stages.map((candidate) =>
    candidate.intake?.fromStageId === input.closing.id
      ? { ...candidate, roster: rosterFor(state, { fed: candidate, closing: input.closing, overrides: input.overrides }) }
      : candidate,
  );
  return { ...state, stages };
}

function nextStages(stages: readonly Stage[], completed: Stage): Stage[] {
  const following = [...stages]
    .filter((stage) => stage.ordinal > completed.ordinal)
    .sort((left, right) => left.ordinal - right.ordinal)[0];
  return stages.map((stage) => {
    if (stage.id === completed.id) return { ...stage, status: 'completed' as const };
    if (following !== undefined && stage.id === following.id && stage.status === 'pending') {
      return { ...stage, status: 'active' as const };
    }
    return stage;
  });
}

export interface CompleteStageCommand {
  stageId: string;
  overrides: readonly StageOverride[];
  reason: string | null;
}

function checkCompletable(state: TournamentState, input: { command: CompleteStageCommand; context: CommandContext }): Stage | CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  if (!isSuperadmin(input.context.actor)) return refuse('not_allowed', 'Only a superadmin can close a stage.');
  const stage = state.stages.find((candidate) => candidate.id === input.command.stageId);
  if (stage === undefined) return refuse('not_found', 'No such stage.');
  if (stage.status === 'completed') return refuse('wrong_status', 'That stage is already over.');
  if (state.matches.some((match) => match.stageId === stage.id && isStageMatchOpen(match))) {
    return refuse('stage_unfinished', 'Every match in this stage must be finished or called off first.');
  }
  return stage;
}

/** Closes a stage and seats what it decided. The system actor (the scheduler) may not decide a tie on a cut. */
export function completeStage(state: TournamentState, command: CompleteStageCommand, context: CommandContext): CommandResult {
  const stage = checkCompletable(state, { command, context });
  if (!('ordinal' in stage)) return stage;
  const reason = cleanReason(command.reason);
  if (command.overrides.length > 0 && reason === null) return refuse('reason_required', 'Say why the table is being overruled.');
  const ties = cutLineTies(state, stage);
  if (context.actor.kind === 'system' && ties.length > 0) {
    return refuse('tie_on_cut', `A tie sits on the cut line (${ties.join(', ')}): a person must decide.`);
  }
  const matches = seatDownstream(state, { stage, overrides: command.overrides, reason });
  const seated = { ...state, matches, stages: nextStages(state.stages, stage) };
  const next = fillFedGroups(feedRosters(seated, { closing: stage, overrides: command.overrides }));
  const event: TournamentEvent = eventOf(context, {
    kind: 'stage_completed',
    reason,
    detail: { stageId: stage.id, overrides: command.overrides.length, tiesOnCut: ties.length },
  });
  return accept(next, [event]);
}

/** ADR-329 F2 — the pairs level on this stage's cut lines, named for the desk closing it. */
export function stageCutTies(state: TournamentState, stage: Stage): string[] {
  return cutLineTies(state, stage);
}

/** The places a stage has decided so far, for the console's "who goes through" panel. */
export function stagePlaces(state: TournamentState, stage: Stage): StandingRow[] {
  const hasGroups = state.groups.some((group) => group.stageId === stage.id);
  return hasGroups ? groupWinnersRanked(state, stage) : stageStandings(state, stage);
}

export function hasEntrant(match: Match, entrantId: string): boolean {
  return match.slots.a.seatedEntrantId === entrantId || match.slots.b.seatedEntrantId === entrantId;
}

/**
 * Whether a match is the entrant's for certain: a seat frozen to it, or a seat that names it outright
 * (`entrant` source — a round robin's fixtures before kick-off). A forecast that only might resolve
 * to it ("Winner of #7") is not, because who fills it is still undecided.
 */
function namesEntrant(match: Match, entrantId: string): boolean {
  const names = (slot: Slot) => slot.source.kind === 'entrant' && slot.source.entrantId === entrantId && slot.seatedEntrantId === null;
  return hasEntrant(match, entrantId) || names(match.slots.a) || names(match.slots.b);
}

function cancelledFor(match: Match, input: { name: string; reason: string; now: string }): Match {
  return {
    ...match,
    status: 'cancelled',
    cancelReason: `${input.name} withdrew: ${input.reason}`,
    endedAt: input.now,
    version: match.version + 1,
  };
}

/** P-03 — a team that stops playing: its results stand, its unplayed matches become visible holes. */
export function withdrawEntrant(
  state: TournamentState,
  command: { entrantId: string; reason: string },
  context: CommandContext,
): CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  if (!isSuperadmin(context.actor)) return refuse('not_allowed', 'Only a superadmin can withdraw a team.');
  const entrant = state.entrants.find((candidate) => candidate.id === command.entrantId);
  if (entrant === undefined) return refuse('not_found', 'No such entrant in this tournament.');
  if (entrant.withdrawnAt !== null) return refuse('wrong_status', 'That team has already withdrawn.');
  const reason = cleanReason(command.reason);
  if (reason === null) return refuse('reason_required', 'Say why the team is withdrawing.');
  if (state.matches.some((match) => match.status === 'in_progress' && hasEntrant(match, entrant.id))) {
    return refuse('live_match', 'That team is playing right now; finish or call off the match first.');
  }
  const entrants = state.entrants.map((row) => (row.id === entrant.id ? { ...row, withdrawnAt: context.now } : row));
  const matches = state.matches.map((match) =>
    match.status === 'scheduled' && namesEntrant(match, entrant.id)
      ? cancelledFor(match, { name: entrant.name, reason, now: context.now })
      : match,
  );
  const event = eventOf(context, { kind: 'entrant_withdrawn', reason, detail: { entrantId: entrant.id } });
  return accept({ ...state, entrants, matches }, [event]);
}

/**
 * ADR-336 — stop the day taking new matches.
 *
 * The one core change the switch needs, and the smallest that makes it safe: a paused tournament
 * refuses `startMatch` and `startPair` and allows everything else. So a match already on a court is
 * finished by the people scoring it, never rerouted out from under them, and nothing new appears on
 * any court from the moment the desk confirms.
 *
 * Deliberately one-way: there is no `resumeTournament`. The switch to court awards is a decision for
 * the rest of the day, so a paused bracket is closed (by the system, when the last live match ends)
 * rather than restarted. Building a return would need its own ADR and command, which is the point —
 * "one-way" is a fact of the machine, not a policy in a probe.
 *
 * Pausing twice is a no-op success: two desk taps on a slow phone must not be an error.
 */
export function pauseTournament(
  state: TournamentState,
  command: { reason: string },
  context: CommandContext,
): CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  if (!isSuperadmin(context.actor)) return refuse('not_allowed', 'Only a superadmin can pause the day.');
  if (state.tournament.pausedAt !== null) return accept(state, []);
  const reason = cleanReason(command.reason);
  if (reason === null) return refuse('reason_required', 'Say why the day stops starting matches.');
  const tournament = { ...state.tournament, pausedAt: context.now };
  return accept({ ...state, tournament }, [eventOf(context, { kind: 'tournament_paused', reason })]);
}

/** P-15 — ending the day as an act: never over a live match, and with a reason when it ends early. */
export function closeTournament(state: TournamentState, command: { reason: string | null }, context: CommandContext): CommandResult {
  const closed = refuseWhenClosed(state);
  if (closed) return closed;
  if (!isSuperadmin(context.actor)) return refuse('not_allowed', 'Only a superadmin can close the tournament.');
  if (state.matches.some((match) => match.status === 'in_progress')) {
    return refuse('live_match', 'A match is still being played: finish or call it off first.');
  }
  const reason = cleanReason(command.reason);
  const isUnfinished = state.matches.some((match) => match.status === 'scheduled');
  if (isUnfinished && reason === null) return refuse('reason_required', 'Matches are still unplayed: say why the day ends now.');
  const tournament = { ...state.tournament, status: 'closed' as const, closeReason: reason };
  return accept({ ...state, tournament }, [eventOf(context, { kind: 'tournament_closed', reason })]);
}
