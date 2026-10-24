import type {
  MatchRecord,
  MatchSchedule,
  ScheduleSummary,
  TournamentSettings,
} from '../../shared/contracts.js';
import type { DraftParticipant, MatchDraft } from './drafts.js';
import { conflict } from '../errors.js';

export function scheduleDrafts(
  drafts: MatchDraft[],
  settings: TournamentSettings,
): Map<string, MatchSchedule> {
  const courts = Array.from({ length: settings.courtCount }, () => settings.startTimeMinutes);
  const teamReadyAt = new Map<string, number>();
  const matchEndAt = new Map<string, number>();
  const schedules = new Map<string, MatchSchedule>();
  for (const draft of drafts) {
    const dependencyTime = dependencyEndTime(draft, matchEndAt);
    const teamTime = Math.max(
      settings.startTimeMinutes,
      ...knownTeamIds(draft).map((teamId) => teamReadyAt.get(teamId) ?? settings.startTimeMinutes),
    );
    const assignment = chooseCourt(courts, Math.max(dependencyTime, teamTime), settings.matchDurationMinutes);
    schedules.set(draft.code, assignment.schedule);
    matchEndAt.set(draft.code, assignment.schedule.endMinute);
    updateTeamAvailability(draft, assignment.schedule.endMinute, teamReadyAt);
    courts[assignment.schedule.courtNumber - 1] = assignment.schedule.endMinute;
  }
  return schedules;
}

export function reflowStagedMatches(
  matches: MatchRecord[],
  settings: Pick<TournamentSettings, 'courtCount' | 'matchDurationMinutes' | 'startTimeMinutes'>,
  effectiveAtMinutes: number,
): MatchRecord[] {
  const courtAvailability = Array.from({ length: settings.courtCount }, () => effectiveAtMinutes);
  const teamAvailability = new Map<string, number>();
  const endById = new Map<string, number>();
  pinRunningMatches(matches, courtAvailability, teamAvailability, endById, effectiveAtMinutes);
  const pendingMatches = matches
    .filter((match) => match.status === 'staged')
    .sort(compareMatchOrder);
  const updatedById = schedulePendingMatches(
    pendingMatches,
    settings,
    effectiveAtMinutes,
    courtAvailability,
    teamAvailability,
    endById,
  );
  return matches.map((match) => updatedById.get(match.id) ?? match);
}

export function scheduleManualMatch(
  matches: MatchRecord[],
  teamIds: string[],
  settings: TournamentSettings,
  requestedStart?: number,
  requestedCourt?: number,
): MatchSchedule {
  if (requestedCourt !== undefined && (requestedCourt < 1 || requestedCourt > settings.courtCount)) {
    throw conflict('Choose a court that is currently available.');
  }
  const courts = requestedCourt ? [requestedCourt] : Array.from({ length: settings.courtCount }, (_, index) => index + 1);
  const candidates = courts.map((court) =>
    findManualStart(matches, teamIds, court, settings, requestedStart),
  );
  const selected = candidates.sort((first, second) => {
    if (first.startMinute !== second.startMinute) return first.startMinute - second.startMinute;
    return first.courtNumber - second.courtNumber;
  })[0];
  if (!selected) throw conflict('No available court can take this match.');
  return selected;
}

function findManualStart(
  matches: MatchRecord[],
  teamIds: string[],
  courtNumber: number,
  settings: TournamentSettings,
  requestedStart?: number,
): MatchSchedule {
  let startMinute = requestedStart ?? settings.startTimeMinutes;
  if (!Number.isInteger(startMinute) || startMinute < settings.startTimeMinutes) {
    throw conflict('Match time must be at or after the tournament start.');
  }
  for (;;) {
    const endMinute = startMinute + settings.matchDurationMinutes;
    const conflicts = matches.filter((match) =>
      match.status !== 'cancelled' &&
      overlaps(startMinute, endMinute, match.schedule.startMinute, match.schedule.endMinute) &&
      (match.schedule.courtNumber === courtNumber || sharesTeam(match, teamIds)),
    );
    if (conflicts.length === 0) return { startMinute, endMinute, courtNumber, durationMinutes: settings.matchDurationMinutes };
    if (requestedStart !== undefined) throw conflict('That time overlaps another match for this team or court.');
    startMinute = Math.min(...conflicts.map((match) => match.schedule.endMinute));
  }
}

function overlaps(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function sharesTeam(match: MatchRecord, teamIds: string[]): boolean {
  const scheduledIds = [match.homeSlot, match.awaySlot].flatMap((slot) =>
    slot.kind === 'team' ? [slot.teamId] : [],
  );
  return teamIds.some((teamId) => scheduledIds.includes(teamId));
}

export function createScheduleSummary(
  matches: Array<Pick<MatchRecord, 'status' | 'schedule'>>,
  startTimeMinutes: number,
  tournamentLengthMinutes: number,
  courtCount: number,
  matchDurationMinutes: number,
): ScheduleSummary {
  const countedMatches = matches.filter((match) => match.status !== 'cancelled');
  const finishTimeMinutes = Math.max(
    startTimeMinutes,
    ...countedMatches.map((match) => match.schedule.endMinute),
  );
  const durationMinutes = finishTimeMinutes - startTimeMinutes;
  return {
    matchCount: countedMatches.length,
    durationMinutes,
    finishTimeMinutes,
    tournamentLengthMinutes,
    fits: durationMinutes <= tournamentLengthMinutes,
    courtsAvailable: courtCount,
    matchDurationMinutes,
  };
}

function pinRunningMatches(
  matches: MatchRecord[],
  courtAvailability: number[],
  teamAvailability: Map<string, number>,
  endById: Map<string, number>,
  effectiveAt: number,
): void {
  for (const match of matches.filter((item) => item.status === 'final' || item.status === 'live')) {
    endById.set(match.id, match.schedule.endMinute);
    updateResolvedTeamAvailability(match, teamAvailability);
    updateCourtAvailability(match, courtAvailability, effectiveAt);
  }
}

function schedulePendingMatches(
  pending: MatchRecord[],
  settings: Pick<TournamentSettings, 'courtCount' | 'matchDurationMinutes'>,
  effectiveAt: number,
  courts: number[],
  teams: Map<string, number>,
  endById: Map<string, number>,
): Map<string, MatchRecord> {
  const updated = new Map<string, MatchRecord>();
  for (const match of pending) {
    const dependencyTime = dependencyIdsEndTime(match, endById, effectiveAt);
    const teamTime = resolvedTeamReadyAt(match, teams, effectiveAt);
    const assignment = chooseCourt(
      courts,
      Math.max(effectiveAt, dependencyTime, teamTime),
      settings.matchDurationMinutes,
    );
    const revised = { ...match, schedule: assignment.schedule };
    updated.set(match.id, revised);
    endById.set(match.id, assignment.schedule.endMinute);
    updateResolvedTeamAvailability(revised, teams);
    courts[assignment.schedule.courtNumber - 1] = assignment.schedule.endMinute;
  }
  return updated;
}

function dependencyEndTime(draft: MatchDraft, endByCode: Map<string, number>): number {
  return Math.max(0, ...draft.dependsOnCodes.map((code) => {
    const end = endByCode.get(code);
    if (end === undefined) throw conflict(`Match ${draft.code} depends on unscheduled match ${code}.`);
    return end;
  }));
}

function dependencyIdsEndTime(
  match: MatchRecord,
  endById: Map<string, number>,
  fallback: number,
): number {
  return Math.max(fallback, ...match.dependsOn.map((id) => endById.get(id) ?? fallback));
}

function chooseCourt(courts: number[], readyAt: number, duration: number): { schedule: MatchSchedule } {
  let bestCourt = 0;
  let bestStart = Number.POSITIVE_INFINITY;
  courts.forEach((courtFreeAt, index) => {
    const candidate = Math.max(courtFreeAt, readyAt);
    if (candidate < bestStart) {
      bestCourt = index;
      bestStart = candidate;
    }
  });
  const endMinute = bestStart + duration;
  return {
    schedule: {
      startMinute: bestStart,
      endMinute,
      courtNumber: bestCourt + 1,
      durationMinutes: duration,
    },
  };
}

function knownTeamIds(match: MatchDraft): string[] {
  return [match.home, match.away].flatMap((participant) =>
    participant.kind === 'team' ? [participant.teamId] : [],
  );
}

function updateTeamAvailability(
  draft: MatchDraft,
  endMinute: number,
  availability: Map<string, number>,
): void {
  knownTeamIds(draft).forEach((teamId) => availability.set(teamId, endMinute));
}

function updateResolvedTeamAvailability(
  match: MatchRecord,
  availability: Map<string, number>,
): void {
  [match.homeSlot, match.awaySlot].forEach((slot) => {
    const teamId = participantTeamId(slot);
    if (teamId) availability.set(teamId, match.schedule.endMinute);
  });
}

function resolvedTeamReadyAt(
  match: MatchRecord,
  availability: Map<string, number>,
  fallback: number,
): number {
  const knownIds = [match.homeSlot, match.awaySlot].flatMap((slot) => {
    const teamId = participantTeamId(slot);
    return teamId ? [teamId] : [];
  });
  return Math.max(fallback, ...knownIds.map((id) => availability.get(id) ?? fallback));
}

function participantTeamId(participant: DraftParticipant | MatchRecord['homeSlot']): string | null {
  return participant.kind === 'team' ? participant.teamId : null;
}

function updateCourtAvailability(
  match: MatchRecord,
  courts: number[],
  effectiveAt: number,
): void {
  const index = match.schedule.courtNumber - 1;
  if (index < 0 || index >= courts.length) return;
  courts[index] = Math.max(effectiveAt, match.schedule.endMinute);
}

function compareMatchOrder(first: MatchRecord, second: MatchRecord): number {
  if (first.roundNumber !== second.roundNumber) return first.roundNumber - second.roundNumber;
  return first.position - second.position;
}
