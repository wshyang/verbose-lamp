import type { MatchView, TeamDetailView, TeamSummaryView } from '@psd/contracts';
import { apiGet, apiPatch, apiPost, apiRemove } from './client.js';

/** Team surfaces S7–S17. */

export function fetchTeams(): Promise<{ items: TeamSummaryView[] }> {
  return apiGet('/api/teams');
}

export function fetchMyTeam(): Promise<{ team: TeamDetailView | null }> {
  return apiGet('/api/teams/mine');
}

export function fetchTeam(teamId: string): Promise<{ team: TeamDetailView }> {
  return apiGet(`/api/teams/${teamId}`);
}

export function fetchTeamMatches(teamId: string): Promise<{ items: MatchView[] }> {
  return apiGet(`/api/teams/${teamId}/matches`);
}

export function createTeam(teamName: string): Promise<{ team: TeamDetailView }> {
  return apiPost('/api/teams', { teamName });
}

export function joinTeamByCode(joinCode: string): Promise<{ team: TeamDetailView }> {
  return apiPost('/api/teams/join', { joinCode });
}

export function joinTeamById(teamId: string): Promise<{ team: TeamDetailView }> {
  return apiPost(`/api/teams/${teamId}/join`);
}

export function leaveTeam(teamId: string): Promise<{ outcome: string }> {
  return apiPost(`/api/teams/${teamId}/leave`);
}

export function addTeamMember(input: {
  teamId: string;
  nickname: string;
}): Promise<{ team: TeamDetailView }> {
  return apiPost(`/api/teams/${input.teamId}/members`, { nickname: input.nickname });
}

export function kickTeamMember(input: {
  teamId: string;
  participantId: string;
}): Promise<{ team: TeamDetailView }> {
  return apiRemove(`/api/teams/${input.teamId}/members/${input.participantId}`);
}

export function setTeamLock(input: {
  teamId: string;
  isLocked: boolean;
}): Promise<{ team: TeamDetailView }> {
  return apiPatch(`/api/teams/${input.teamId}/lock`, { isLocked: input.isLocked });
}

export function transferCaptaincy(input: {
  teamId: string;
  participantId: string;
}): Promise<{ team: TeamDetailView }> {
  return apiPost(`/api/teams/${input.teamId}/captain`, { participantId: input.participantId });
}
