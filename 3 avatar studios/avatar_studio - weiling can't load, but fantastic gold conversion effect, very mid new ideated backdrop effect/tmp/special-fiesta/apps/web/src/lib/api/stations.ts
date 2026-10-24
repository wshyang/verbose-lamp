import type {
  ActivityView,
  CourtView,
  DumbCourtView,
  FixtureView,
  MatchView,
  ParticipantView,
  RoundView,
  ScanView,
  TournamentModeView,
  TournamentView,
} from '@psd/contracts';
import { apiGet, apiPost, apiPut } from './client.js';

/** Facilitator station surfaces S19–S33. */

export function fetchCourts(): Promise<{ items: CourtView[] }> {
  return apiGet('/api/tournament/courts');
}

export function fetchCurrentMatch(courtId: string): Promise<{ match: MatchView | null }> {
  return apiGet(`/api/tournament/courts/${courtId}/current-match`);
}

/** ADR-097 — the teams that most recently finished a match on this court, newest first. */
export function fetchRecentCourtTeams(courtId: string): Promise<{ teamIds: string[] }> {
  return apiGet(`/api/tournament/courts/${courtId}/recent-teams`);
}

export function startMatch(input: {
  courtId: string;
  teamAId: string;
  teamBId: string;
}): Promise<{ match: MatchView }> {
  return apiPost('/api/tournament/matches', input);
}

/** ADR-152 (F-1) — a null winner is a declared draw, not an omission. */
export function completeMatch(input: {
  matchId: string;
  winnerTeamId: string | null;
  tiebreakMethod?: 'coin_toss' | 'rock_paper_scissors' | null;
}): Promise<{ match: MatchView }> {
  return apiPost(`/api/tournament/matches/${input.matchId}/complete`, {
    winnerTeamId: input.winnerTeamId,
    tiebreakMethod: input.tiebreakMethod ?? null,
  });
}

/** ADR-114 — one rally, one tap. `from` is the score the marshal could see when they tapped. */
export function setMatchScore(input: {
  matchId: string;
  side: 'a' | 'b';
  from: number;
  to: number;
}): Promise<{ match: MatchView }> {
  return apiPost(`/api/tournament/matches/${input.matchId}/score`, {
    side: input.side,
    from: input.from,
    to: input.to,
  });
}

export function cancelMatch(matchId: string): Promise<{ match: MatchView }> {
  return apiPost(`/api/tournament/matches/${matchId}/cancel`);
}

export function fetchActivities(): Promise<{ items: ActivityView[] }> {
  return apiGet('/api/fringe/activities');
}

/** ADR-116 — the station is told the day's participation floor so it can label and queue it. */
export function fetchActivity(
  activityId: string,
): Promise<{ activity: ActivityView; participationPoints: number }> {
  return apiGet(`/api/fringe/activities/${activityId}`);
}

export function openRound(activityId: string): Promise<{ round: RoundView }> {
  return apiPost(`/api/fringe/activities/${activityId}/rounds`);
}

export function advanceRound(roundId: string): Promise<{ round: RoundView }> {
  return apiPost(`/api/fringe/rounds/${roundId}/advance`);
}

export function endRound(roundId: string): Promise<{ round: RoundView }> {
  return apiPost(`/api/fringe/rounds/${roundId}/end`);
}

export function reactivateRound(roundId: string): Promise<{ round: RoundView }> {
  return apiPost(`/api/fringe/rounds/${roundId}/reactivate`);
}

export function fetchRoundScans(roundId: string): Promise<{ items: ScanView[] }> {
  return apiGet(`/api/fringe/rounds/${roundId}/scans`);
}

export interface ScanPayload {
  nickname: string;
  roundId: string;
  /**
   * ADR-092 — the armed tier's label; the server prices it from the activity.
   * ADR-116 — null is the participation award, priced from the day's floor instead.
   */
  tierLabel: string | null;
  /** ADR-116 — overwrite the award already holding this participant's slot in the round. */
  replaceExisting?: boolean;
  clientScanUuid: string;
  clientTimestamp: string;
}

export function postScan(body: ScanPayload): Promise<{ scan: ScanView; duplicate: boolean }> {
  return apiPost('/api/fringe/scans', body);
}

/** ADR-138 — the station taking back its own scan inside the server-enforced window. */
export function undoScan(scanId: string): Promise<{ scan: ScanView }> {
  return apiPost(`/api/fringe/scans/${scanId}/undo`, {});
}

export function findParticipantByNickname(
  nickname: string,
): Promise<{ participant: ParticipantView }> {
  return apiGet(`/api/staff/participants/by-nickname/${encodeURIComponent(nickname)}`);
}

/** ADR-101 — the PIN-reset combobox: nickname substring search over the staff directory. */
export function searchStaffParticipants(
  search: string,
): Promise<{ items: { participant: ParticipantView; teamName: string | null }[] }> {
  return apiGet(`/api/staff/participants?search=${encodeURIComponent(search)}`);
}

/** ADR-088 — the manual-entry lookup, `by-nickname`'s naming mirror. */
export function findParticipantByNumber(
  scanNumber: string,
): Promise<{ participant: ParticipantView }> {
  return apiGet(`/api/staff/participants/by-number/${encodeURIComponent(scanNumber)}`);
}

export function resetParticipantPin(input: {
  participantId: string;
  pin: string;
}): Promise<{ participant: ParticipantView }> {
  return apiPut(`/api/staff/participants/${input.participantId}/pin`, { pin: input.pin });
}

/** ADR-089 — the console's prepopulation feed: this court's suggested fixtures first. */
export interface CourtSchedule {
  tournament: TournamentView | null;
  upNext: FixtureView[];
  pendingPairs: { fixtureId: string; teamAId: string; teamBId: string }[];
}

export function fetchSchedule(courtId: string): Promise<CourtSchedule> {
  return apiGet(`/api/tournament/schedule?courtId=${encodeURIComponent(courtId)}`);
}

/** ADR-321 — dumb courts: whether the courts are awarding today, one court's award page, and the writes. */
export function fetchDumbStatus(): Promise<{ active: boolean }> {
  return apiGet('/api/tournament/dumb/status');
}

/**
 * ADR-336 §5.4 — the room's mode and the ask waiting on the desk, in one read. `courtId` makes the
 * answer per court: during the drain this court may still be finishing while its neighbours award.
 */
export function fetchTournamentMode(courtId?: string): Promise<TournamentModeView> {
  const query = courtId === undefined ? '' : `?courtId=${encodeURIComponent(courtId)}`;
  return apiGet(`/api/tournament/mode${query}`);
}

/** A facilitator's ask: a question for the desk, with who asked and why. */
export function askToSwitch(input: { reason: string; courtId?: string; clientUuid: string }): Promise<TournamentModeView> {
  return apiPost('/api/tournament/mode/requests', input);
}

export function fetchDumbCourt(courtId: string): Promise<DumbCourtView> {
  return apiGet(`/api/tournament/dumb/courts/${courtId}`);
}

export function awardDumbPoints(input: { courtId: string; teamId: string; tierLabel: string; clientAwardUuid: string }): Promise<DumbCourtView> {
  return apiPost(`/api/tournament/dumb/courts/${input.courtId}/awards`, {
    teamId: input.teamId,
    tierLabel: input.tierLabel,
    clientAwardUuid: input.clientAwardUuid,
  });
}

export function voidDumbAward(awardId: string): Promise<DumbCourtView> {
  return apiPost(`/api/tournament/dumb/awards/${awardId}/void`, {});
}
