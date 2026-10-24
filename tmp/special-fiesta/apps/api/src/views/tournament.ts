import type {
  BracketGroupView,
  BracketRoundView,
  CourtView,
  FixtureView,
  MatchStage,
  MatchView,
  TournamentBracketView,
  TournamentView,
} from '@psd/contracts';
import {
  currentOccupant,
  groupStandings,
  isGroupDecided,
  type Group,
  type Match,
  type Side,
  type Stage,
  type TournamentState,
} from '@psd/tournament/core';

/**
 * ADR-277 — the compatibility contract: the rebuilt tournament, in the wire shapes the participant,
 * facilitator and hall-screen code already reads (docs/design/tournament-engine.md §7). Those
 * surfaces are kept byte-for-byte, so every field they render is filled here, from engine state.
 *
 * - `MatchStage`: a stage that allows draws is 'group'; otherwise a placement match is 'third_place'
 *   and every other match 'knockout' — exactly the two facts the court console reads from it.
 * - `FixtureView.status`: scheduled → pending, live → claimed, finished → played (walkover for a
 *   walkover), called off → skipped.
 * - An unresolved seat names its feeder in `teamXFromSequence` where it has one, and otherwise carries
 *   its forecast label ("1st in Group A") in `teamXName` with a null id.
 */

export interface ViewContext {
  state: TournamentState;
  /** Entrant id → app team id. */
  teamOf: ReadonlyMap<string, string>;
  /** Court id → its display label. */
  courtLabels: ReadonlyMap<string, string>;
  /** Format id, for the summary the console and the hall screen read. */
  formatId: string | null;
}

function stageOf(context: ViewContext, match: Match): Stage | undefined {
  return context.state.stages.find((stage) => stage.id === match.stageId);
}

export function matchStageOf(context: ViewContext, match: Match): MatchStage {
  if (stageOf(context, match)?.allowsDraws ?? true) return 'group';
  return match.isPlacement ? 'third_place' : 'knockout';
}

interface Seat {
  entrantId: string | null;
  teamId: string | null;
  name: string | null;
}

function seatOf(context: ViewContext, input: { match: Match; side: Side }): Seat {
  const entrantId = currentOccupant(context.state, input);
  if (entrantId === null) return { entrantId, teamId: null, name: null };
  const name = context.state.entrants.find((entrant) => entrant.id === entrantId)?.name ?? null;
  return { entrantId, teamId: context.teamOf.get(entrantId) ?? null, name };
}

function winnerTeam(context: ViewContext, match: Match): { id: string | null; name: string | null } {
  const side = match.result?.winnerSide ?? null;
  if (side === null || match.status !== 'completed') return { id: null, name: null };
  const seat = seatOf(context, { match, side });
  return { id: seat.teamId, name: seat.name };
}

function paidPoints(context: ViewContext, match: Match): { win: number | null; loss: number | null; draw: number | null } {
  const paid = context.state.awards.filter((award) => award.matchId === match.id && award.kind === 'result');
  const paidTo = (side: Side) => paid.find((award) => award.entrantId === match.slots[side].seatedEntrantId)?.points ?? null;
  const winnerSide = match.result?.winnerSide ?? null;
  if (match.status !== 'completed') return { win: null, loss: null, draw: null };
  if (winnerSide === null) return { win: null, loss: null, draw: paidTo('a') };
  return { win: paidTo(winnerSide), loss: paidTo(winnerSide === 'a' ? 'b' : 'a'), draw: null };
}

function courtLabelOf(context: ViewContext, match: Match): string {
  return match.courtId === null ? '' : (context.courtLabels.get(match.courtId) ?? '');
}

function teamsOf(context: ViewContext, match: Match): Pick<MatchView, 'teamAId' | 'teamAName' | 'teamBId' | 'teamBName'> {
  const a = seatOf(context, { match, side: 'a' });
  const b = seatOf(context, { match, side: 'b' });
  return { teamAId: a.teamId ?? '', teamAName: a.name ?? match.slots.a.label, teamBId: b.teamId ?? '', teamBName: b.name ?? match.slots.b.label };
}

function startedAtOf(match: Match): string {
  return match.startedAt ?? match.plannedStartAt ?? new Date(0).toISOString();
}

/** A match that has started, in the feed's shape. The rates are read off the awards it paid. */
export function matchView(context: ViewContext, match: Match): MatchView {
  const winner = winnerTeam(context, match);
  const points = paidPoints(context, match);
  return {
    id: match.id,
    courtId: match.courtId ?? '',
    courtLabel: courtLabelOf(context, match),
    ...teamsOf(context, match),
    // Superseded fixtures never reach a view (load excludes them); the fallback only satisfies the type.
    status: match.status === 'scheduled' || match.status === 'superseded' ? 'in_progress' : match.status,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    winnerTeamId: winner.id,
    winnerTeamName: winner.name,
    startedByFacilitatorId: match.startedBy?.id ?? '',
    startedByUsername: match.startedBy?.label ?? '',
    startedAt: startedAtOf(match),
    completedAt: match.status === 'completed' ? match.endedAt : null,
    winPointsSnapshot: points.win,
    lossPointsSnapshot: points.loss,
    drawPointsSnapshot: points.draw,
    stage: matchStageOf(context, match),
    isVoided: match.isVoided,
    lastEditedAt: null,
    editReason: null,
  };
}

function fixtureStatus(match: Match): FixtureView['status'] {
  if (match.status === 'scheduled') return 'pending';
  if (match.status === 'in_progress') return 'claimed';
  if (match.status === 'cancelled') return 'skipped';
  return match.result?.kind === 'walkover' ? 'walkover' : 'played';
}

function feederSequence(context: ViewContext, input: { match: Match; side: Side }): number | null {
  const source = input.match.slots[input.side].source;
  if (source.kind !== 'winner_of' && source.kind !== 'loser_of') return null;
  return context.state.matches.find((other) => other.id === source.matchId)?.sequence ?? null;
}

function seatName(context: ViewContext, input: { match: Match; side: Side; seat: Seat }): string | null {
  if (input.seat.name !== null) return input.seat.name;
  // A feeder seat is named by the client from its sequence ("Winner of #7"); any other unknown seat
  // carries its own forecast label.
  return feederSequence(context, input) === null ? input.match.slots[input.side].label : null;
}

/** A match as a line-up row: who (or what) fills each seat, where and when it is planned. */
export function fixtureView(context: ViewContext, match: Match): FixtureView {
  const a = seatOf(context, { match, side: 'a' });
  const b = seatOf(context, { match, side: 'b' });
  return {
    id: match.id,
    stage: matchStageOf(context, match),
    roundNumber: match.round,
    groupCode: context.state.groups.find((group) => group.id === match.groupId)?.code ?? null,
    sequence: match.sequence,
    teamAId: a.teamId,
    teamAName: seatName(context, { match, side: 'a', seat: a }),
    teamBId: b.teamId,
    teamBName: seatName(context, { match, side: 'b', seat: b }),
    suggestedCourtLabel: match.courtId === null ? null : (context.courtLabels.get(match.courtId) ?? null),
    estimatedStartAt: match.status === 'scheduled' ? match.plannedStartAt : null,
    teamAFromSequence: feederSequence(context, { match, side: 'a' }),
    teamBFromSequence: feederSequence(context, { match, side: 'b' }),
    status: fixtureStatus(match),
    resolvedWinnerTeamId: winnerTeam(context, match).id,
  };
}

function legacyTournamentStatus(context: ViewContext): TournamentView['status'] {
  if (context.state.tournament.status === 'closed') return 'completed';
  const stages = context.state.stages;
  const active = stages.find((stage) => stage.status === 'active') ?? stages.find((stage) => stage.status === 'pending');
  if (active === undefined) return 'completed';
  return active.kind === 'pool' || active.kind === 'open' ? 'group_stage' : 'knockout';
}

/** The tournament summary the line-ups and the court console read. */
export function tournamentView(context: ViewContext, startedAt: string): TournamentView {
  const firstPool = context.state.stages.find((stage) => stage.kind === 'pool');
  const groups = context.state.groups.filter((group) => group.stageId === firstPool?.id);
  return {
    id: context.state.tournament.id,
    format: context.formatId === 'round_robin' ? 'round_robin' : 'world_cup',
    status: legacyTournamentStatus(context),
    groupSize: groups.reduce((most, group) => Math.max(most, group.entrantIds.length), 0),
    advanceCount: firstPool?.advanceCount ?? 0,
    hasThirdPlace: context.state.matches.some((match) => match.isPlacement),
    knockoutPairing: 'classic',
    activatedAt: startedAt,
  };
}

/** A court as the station picker and the court console read it. */
export function courtView(
  context: ViewContext,
  court: { id: string; courtNumber: number; label: string; isEnabled: boolean },
): CourtView {
  const live = context.state.matches.find((match) => match.status === 'in_progress' && match.courtId === court.id);
  return {
    id: court.id,
    courtNumber: court.courtNumber,
    displayLabel: court.label,
    isEnabled: court.isEnabled,
    assignedFacilitatorId: null,
    assignedFacilitatorUsername: null,
    currentMatchId: live?.id ?? null,
  };
}

function groupView(context: ViewContext, group: Group): BracketGroupView {
  const hasPlayed = context.state.matches.some((match) => match.groupId === group.id && match.status === 'completed');
  const advance = context.state.stages.find((row) => row.id === group.stageId)?.advanceCount ?? 0;
  const isDecided = isGroupDecided(context.state, group);
  return {
    code: group.code,
    slots: groupStandings(context.state, group).map((row) => ({
      teamId: context.teamOf.get(row.entrantId) ?? null,
      label: row.name,
      played: row.played,
      wins: row.wins,
      draws: row.draws,
      rank: hasPlayed ? row.rank : null,
      isQualifying: advance > 0 && row.rank <= advance && isDecided,
    })),
  };
}

function roundLabel(fromEnd: number, round: number): string {
  if (fromEnd === 1) return 'Final';
  if (fromEnd === 2) return 'Semi-finals';
  if (fromEnd === 3) return 'Quarter-finals';
  return `Round ${round}`;
}

function bracketMatch(context: ViewContext, match: Match) {
  const winnerSide = match.status === 'completed' ? (match.result?.winnerSide ?? null) : null;
  const seat = (side: Side) => {
    const occupant = seatOf(context, { match, side });
    return { label: occupant.name ?? match.slots[side].label, teamId: occupant.teamId, isWinner: winnerSide === side };
  };
  return { fixtureId: match.id, a: seat('a'), b: seat('b') };
}

function bracketRounds(context: ViewContext): BracketRoundView[] {
  const bracketStages = new Set(context.state.stages.filter((stage) => stage.kind === 'bracket').map((stage) => stage.id));
  const matches = context.state.matches.filter((match) => bracketStages.has(match.stageId) && !match.isPlacement);
  const rounds = [...new Set(matches.map((match) => match.round))].sort((left, right) => left - right);
  return rounds.map((round, index) => ({
    label: roundLabel(rounds.length - index, round),
    matches: matches.filter((match) => match.round === round).map((match) => bracketMatch(context, match)),
  }));
}

/** The day's shape for the hall screen: groups with their tables, then the road to the final. */
export function bracketView(context: ViewContext): TournamentBracketView {
  const summary = tournamentView(context, '');
  return {
    status: summary.status,
    format: summary.format,
    teamCount: context.state.entrants.length,
    groupSize: summary.groupSize,
    advanceCount: summary.advanceCount,
    hasThirdPlace: summary.hasThirdPlace,
    knockoutPairing: summary.knockoutPairing,
    groups: context.state.groups.map((group) => groupView(context, group)),
    rounds: bracketRounds(context),
  };
}
