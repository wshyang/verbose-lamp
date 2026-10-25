import type {
  AdminCourtView,
  AdminEntrantView,
  AdminMatchView,
  AdminSeatView,
  AdminStageView,
  AdminStandingView,
  AdminSchedulerView,
  FitView,
  PlacementChangeView,
  SchedulerFormatId,
} from '@psd/contracts';
import {
  awardTotals,
  currentOccupant,
  groupStandings,
  openSeatConflicts,
  stageAdvancers,
  stageCutTies,
  stagePlaces,
  tablePointsOf,
  type Match,
  type Side,
  type StandingRow,
  type TournamentState,
} from '@psd/tournament/core';
import type { FitSummary, PlacementChange } from '@psd/tournament/scheduler';
import type { TournamentCourtRow, TournamentSchedulerRow } from '../db/schema/index.js';
import type { ViewContext } from './tournament.js';

/**
 * ADR-279 — the superadmin console's shapes, from engine state. Unlike the compatibility views
 * (ADR-277) these say everything the desk decides with: which seats are frozen, which matches are
 * pinned, why a team is ranked where it is, and what the planner thinks of the day.
 */

/** Minutes on the planner's clock (minutes since the epoch) → an instant. */
export function instantOf(minutes: number): string {
  return new Date(minutes * 60_000).toISOString();
}

export function adminCourtView(court: TournamentCourtRow): AdminCourtView {
  return { id: court.id, courtNumber: court.courtNumber, label: court.label, isEnabled: court.isEnabled };
}

function seatView(context: ViewContext, input: { match: Match; side: Side }): AdminSeatView {
  const slot = input.match.slots[input.side];
  const entrantId = currentOccupant(context.state, input);
  const entrant = context.state.entrants.find((row) => row.id === entrantId);
  return {
    label: slot.label,
    teamId: entrantId === null ? null : (context.teamOf.get(entrantId) ?? null),
    teamName: entrant?.name ?? null,
    isSeated: slot.seatedEntrantId !== null,
    seatOverrideReason: slot.seatOverrideReason,
  };
}

/** Where a match sits in the day: its stage's name, its group, its court. */
function placeOf(context: ViewContext, match: Match): Pick<AdminMatchView, 'stageLabel' | 'groupCode' | 'courtLabel'> {
  return {
    stageLabel: context.state.stages.find((stage) => stage.id === match.stageId)?.label ?? '',
    groupCode: context.state.groups.find((group) => group.id === match.groupId)?.code ?? null,
    courtLabel: match.courtId === null ? null : (context.courtLabels.get(match.courtId) ?? null),
  };
}

/** ADR-329 F3 — the first open seat conflict on a match, in team terms, or null. */
function seatConflictView(context: ViewContext, match: Match): AdminMatchView['seatConflict'] {
  const conflict = openSeatConflicts(context.state).find((row) => row.matchId === match.id);
  if (conflict === undefined) return null;
  const nameOf = (entrantId: string | null) =>
    entrantId === null ? null : (context.state.entrants.find((row) => row.id === entrantId)?.name ?? null);
  const teamOf = (entrantId: string | null) => (entrantId === null ? null : (context.teamOf.get(entrantId) ?? null));
  return {
    side: conflict.side,
    seatedTeamId: teamOf(conflict.seatedEntrantId),
    seatedTeamName: nameOf(conflict.seatedEntrantId),
    wouldBeTeamId: teamOf(conflict.wouldBeEntrantId),
    wouldBeTeamName: nameOf(conflict.wouldBeEntrantId),
  };
}

export function adminMatchView(context: ViewContext, input: { match: Match; pinned: ReadonlySet<string> }): AdminMatchView {
  const { match } = input;
  return {
    id: match.id,
    code: match.code,
    stageId: match.stageId,
    ...placeOf(context, match),
    round: match.round,
    sequence: match.sequence,
    origin: match.origin,
    isPlacement: match.isPlacement,
    // A replaced fixture is history, not a desk row (load excludes superseded matches).
    status: match.status === 'superseded' ? 'cancelled' : match.status,
    courtId: match.courtId,
    plannedStartAt: match.plannedStartAt,
    plannedMinutes: match.plannedMinutes,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    startedByLabel: match.startedBy?.label ?? null,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    resultKind: match.result?.kind ?? null,
    winnerSide: match.result?.winnerSide ?? null,
    isVoided: match.isVoided,
    cancelReason: match.cancelReason,
    isPinned: input.pinned.has(match.id),
    seatConflict: seatConflictView(context, match),
    a: seatView(context, { match, side: 'a' }),
    b: seatView(context, { match, side: 'b' }),
  };
}

function standingView(context: ViewContext, row: StandingRow): AdminStandingView {
  return {
    teamId: context.teamOf.get(row.entrantId) ?? null,
    name: row.name,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    difference: row.difference,
    points: row.points,
    rank: row.rank,
    explanation: row.explanation,
  };
}

/** ADR-325 — the feeder's name and the intake, for a stage that is waiting on (or was fed by) an earlier one. */
function intakeView(state: ViewContext['state'], stage: ViewContext['state']['stages'][number]): AdminStageView['intake'] {
  if (stage.intake === null) return null;
  const feeder = state.stages.find((candidate) => candidate.id === stage.intake?.fromStageId);
  return { fromLabel: feeder?.label ?? 'the previous stage', count: stage.intake.count };
}

/**
 * ADR-334 — the stage's plan code, recovered from its first fixture: draft fixture codes end
 * in `-<number>` and carry their stage's code before it ('GRP-A-3' → 'GRP-A' is a group, so
 * take everything before the last dash, then the segment before any group letter). '' when
 * the stage has no fixtures yet.
 */
function stageCodeOf(state: ViewContext['state'], stageId: string): string {
  const code = state.matches.find((match) => match.stageId === stageId)?.code ?? '';
  const stem = code.replace(/-\d+$/, '');
  return stem.split('-')[0] ?? '';
}

export function adminStageViews(context: ViewContext): AdminStageView[] {
  const { state } = context;
  const standingsOf = (rows: StandingRow[]) => rows.map((row) => standingView(context, row));
  return state.stages.map((stage) => ({
    id: stage.id,
    code: stageCodeOf(state, stage.id),
    hasStarted: state.matches.some(
      (match) => match.stageId === stage.id && (match.startedAt !== null || match.status === 'in_progress' || match.status === 'completed'),
    ),
    rosterCount: stage.roster.length,
    label: stage.label,
    kind: stage.kind,
    status: stage.status,
    advanceCount: stage.advanceCount,
    tablePoints: tablePointsOf(stage),
    intake: intakeView(state, stage),
    cutTies: stageCutTies(state, stage),
    advancers: stageAdvancers(state, stage).map((place) => ({
      teamId: context.teamOf.get(place.row.entrantId) ?? null,
      name: place.row.name,
      place: place.place,
      via: place.via,
    })),
    groups: state.groups
      .filter((group) => group.stageId === stage.id)
      .map((group) => ({ id: group.id, code: group.code, label: group.label, standings: standingsOf(groupStandings(state, group)) })),
    standings: standingsOf(stagePlaces(state, stage)),
  }));
}

export function adminEntrantViews(context: ViewContext): AdminEntrantView[] {
  const totals = awardTotals(context.state);
  return context.state.entrants.map((entrant) => ({
    teamId: context.teamOf.get(entrant.id) ?? '',
    name: entrant.name,
    entryOrder: entrant.entryOrder,
    withdrawnAt: entrant.withdrawnAt,
    awardedPoints: totals.get(entrant.id) ?? 0,
  }));
}

export function adminSchedulerView(row: TournamentSchedulerRow): AdminSchedulerView {
  return {
    format: row.format as SchedulerFormatId,
    options: row.options,
    status: row.status,
    matchMinutes: row.matchMinutes,
    changeoverMinutes: row.changeoverMinutes,
    restMinutes: row.restMinutes,
    deadlineAt: row.deadlineAt?.toISOString() ?? null,
    plannedAt: row.plannedAt?.toISOString() ?? null,
    terminatedAt: row.terminatedAt?.toISOString() ?? null,
    terminatedByLabel: row.terminatedByLabel,
    terminateReason: row.terminateReason,
    revision: row.revision,
  };
}

export function fitView(fit: FitSummary): FitView {
  return {
    remainingMatches: fit.remainingMatches,
    courtMinutes: fit.courtMinutes,
    projectedFinishAt: fit.projectedFinish === null ? null : instantOf(fit.projectedFinish),
    fitsDeadline: fit.fitsDeadline,
    overrunMinutes: fit.overrunMinutes,
  };
}

export function placementChangeView(context: ViewContext, change: PlacementChange): PlacementChangeView {
  const at = (where: PlacementChange['from']) =>
    where === null ? null : { courtLabel: context.courtLabels.get(where.courtId) ?? '', startAt: instantOf(where.start) };
  return {
    matchId: change.matchId,
    code: context.state.matches.find((match) => match.id === change.matchId)?.code ?? '',
    kind: change.kind,
    from: at(change.from),
    to: at(change.to),
  };
}

/** The scheduled matches the planner could not place: no court, or no time. */
export function unplacedMatches(state: TournamentState): Match[] {
  return state.matches.filter((match) => match.status === 'scheduled' && (match.courtId === null || match.plannedStartAt === null));
}
