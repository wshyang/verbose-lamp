import type {
  AgendaItemView,
  AgendaItemRequest,
  ActivityView,
  BootstrapStatusView,
  ClusterAdminView,
  CreateActivityRequest,
  CreateFacilitatorRequest,
  EditActivityRequest,
  EditFacilitatorRequest,
  FacilitatorView,
  FinalStandingsView,
  OperationsOverviewView,
  ParticipantDetailView,
  ParticipantView,
  PointConfigView,
  ScanView,
  ScoreAdjustmentView,
  ScreenSceneId,
  ScreenKeyView,
  ServiceStateView,
  SuperadminView,
  SystemResetView,
  TeamSummaryView,
  VoidAuditEntryView,
} from '@psd/contracts';
import { apiGet, apiPatch, apiPost, apiPut, apiRemove } from './client.js';

/** Superadmin surfaces S35–S59. */

export function fetchDashboard(): Promise<{ status: BootstrapStatusView }> {
  return apiGet('/api/admin/dashboard');
}

/** ADR-151 — the last fifteen minutes, in one read. */
export function fetchOperationsOverview(): Promise<{ overview: OperationsOverviewView }> {
  return apiGet('/api/admin/operations');
}

export function fetchPointConfig(): Promise<{ pointConfig: PointConfigView | null }> {
  return apiGet('/api/admin/point-config');
}

export function savePointConfig(body: {
  /** ADR-116 — what turning up to a fringe activity is worth when you do not place. */
  fringeParticipationPoints: number;
  /** ADR-176 — the passport bonus and the distinct-station count that earns it; 0 is off. */
  fringePassportBonusPoints: number;
  fringePassportStations: number;
}): Promise<{ pointConfig: PointConfigView }> {
  return apiPut('/api/admin/point-config', body);
}

export function fetchAdminActivities(): Promise<{ items: ActivityView[] }> {
  return apiGet('/api/admin/activities');
}

export function createActivity(body: CreateActivityRequest): Promise<{ activity: ActivityView }> {
  return apiPost('/api/admin/activities', body);
}

export function updateActivity(input: {
  activityId: string;
  body: EditActivityRequest;
}): Promise<{ activity: ActivityView }> {
  return apiPut(`/api/admin/activities/${input.activityId}`, input.body);
}

export function setActivityActive(input: {
  activityId: string;
  isEnabled: boolean;
}): Promise<{ activity: ActivityView }> {
  return apiPatch(`/api/admin/activities/${input.activityId}/active`, {
    isEnabled: input.isEnabled,
  });
}

/* ADR-177 — the day's programme. No delete: cancelling is a deactivation, like a court. */
export function fetchAdminAgenda(): Promise<{ items: AgendaItemView[] }> {
  return apiGet('/api/admin/agenda');
}

export function createAgendaItem(body: AgendaItemRequest): Promise<{ item: AgendaItemView }> {
  return apiPost('/api/admin/agenda', body);
}

export function updateAgendaItem(input: {
  itemId: string;
  body: AgendaItemRequest;
}): Promise<{ item: AgendaItemView }> {
  return apiPatch(`/api/admin/agenda/${input.itemId}`, input.body);
}

export function setAgendaItemActive(input: {
  itemId: string;
  isEnabled: boolean;
}): Promise<{ item: AgendaItemView }> {
  return apiPatch(`/api/admin/agenda/${input.itemId}/active`, { isEnabled: input.isEnabled });
}

/** ADR-190 — answers with the whole programme, because a move is relative to its neighbours. */
export function moveAgendaItem(input: {
  itemId: string;
  direction: 'up' | 'down';
}): Promise<{ items: AgendaItemView[] }> {
  return apiPost(`/api/admin/agenda/${input.itemId}/move`, { direction: input.direction });
}

/**
 * ADR-172 — S44 the cluster catalogue.
 *
 * `scoringStarted` rides along with the list because the console has to be able to explain the
 * freeze before it bites, not only after a refusal.
 */
export function fetchAdminClusters(): Promise<{
  items: ClusterAdminView[];
  scoringStarted: boolean;
}> {
  return apiGet('/api/admin/clusters');
}

export function createCluster(body: {
  code: string;
  displayName: string;
}): Promise<{ cluster: ClusterAdminView }> {
  return apiPost('/api/admin/clusters', body);
}

/** Only the label. The code is the key three tables point at. */
export function renameCluster(input: {
  code: string;
  displayName: string;
}): Promise<{ cluster: ClusterAdminView }> {
  return apiPut(`/api/admin/clusters/${encodeURIComponent(input.code)}`, {
    displayName: input.displayName,
  });
}

/** There is no delete: history snapshots the code forever, so a cluster is retired. */
export function setClusterRetired(input: {
  code: string;
  isRetired: boolean;
}): Promise<{ cluster: ClusterAdminView }> {
  const action = input.isRetired ? 'retire' : 'restore';
  return apiPost(`/api/admin/clusters/${encodeURIComponent(input.code)}/${action}`);
}

/** Empties a cluster so it can be retired. */
export function reassignCluster(input: {
  code: string;
  toClusterCode: string;
}): Promise<{ moved: number; cluster: ClusterAdminView }> {
  return apiPost(`/api/admin/clusters/${encodeURIComponent(input.code)}/reassign`, {
    toClusterCode: input.toClusterCode,
  });
}

export function reassignParticipantCluster(input: {
  participantId: string;
  toClusterCode: string;
}): Promise<{ participant: ParticipantView }> {
  return apiPut(`/api/admin/participants/${input.participantId}/cluster`, {
    toClusterCode: input.toClusterCode,
  });
}

export function fetchFacilitators(): Promise<{ items: FacilitatorView[] }> {
  return apiGet('/api/admin/facilitators');
}

export function createFacilitator(
  body: CreateFacilitatorRequest,
): Promise<{ facilitator: FacilitatorView }> {
  return apiPost('/api/admin/facilitators', body);
}

export function updateFacilitator(input: {
  facilitatorId: string;
  body: EditFacilitatorRequest;
}): Promise<{ facilitator: FacilitatorView }> {
  return apiPut(`/api/admin/facilitators/${input.facilitatorId}`, input.body);
}

export function fetchAdminScans(activityId?: string): Promise<{ items: ScanView[] }> {
  const query = activityId ? `?activityId=${activityId}` : '';
  return apiGet(`/api/admin/scans${query}`);
}

export function voidScan(input: { scanId: string; reason: string }): Promise<{ scan: ScanView }> {
  return apiPost(`/api/admin/scans/${input.scanId}/void`, { reason: input.reason });
}

export function unvoidScan(input: { scanId: string; reason: string }): Promise<{ scan: ScanView }> {
  return apiPost(`/api/admin/scans/${input.scanId}/unvoid`, { reason: input.reason });
}

export function fetchAdminParticipants(
  search: string,
  clusterCode = '',
): Promise<{ items: { participant: ParticipantView; teamName: string | null }[] }> {
  // ADR-164 — the cluster narrows the desk's list the same way it narrows the participant's
  // own lookup. Sent only when set: the route treats an empty value as "no filter", and
  // spelling that out here keeps the query string honest about what was asked for.
  const query = new URLSearchParams({ search });
  if (clusterCode !== '') query.set('clusterCode', clusterCode);
  return apiGet(`/api/admin/participants?${query.toString()}`);
}

export function fetchParticipantDetail(participantId: string): Promise<ParticipantDetailView> {
  return apiGet(`/api/admin/participants/${participantId}`);
}

/** ADR-117 — grant or deduct points by hand, with the reason that justifies it. */
export function createAdjustment(input: {
  participantId: string;
  activityId: string;
  points: number;
  reason: string;
}): Promise<{ adjustment: ScoreAdjustmentView }> {
  const { participantId, ...body } = input;
  return apiPost(`/api/admin/participants/${participantId}/adjustments`, body);
}

/** ADR-154 — a repair names a person by id; a nickname is a label, not a handle. */
export interface AdminTeamMember {
  participantId: string;
  nickname: string;
  isCaptain: boolean;
}

export interface AdminTeamRow {
  team: TeamSummaryView;
  memberNicknames: string[];
  members: AdminTeamMember[];
}

export function fetchAdminTeams(): Promise<{ items: AdminTeamRow[] }> {
  return apiGet('/api/admin/teams');
}

/**
 * ADR-154 §7 — what emptying a team did to the schedule. Null unless this repair disbanded it.
 */
export interface WithdrawalView {
  playedCount: number;
  skippedCount: number;
  affectedTeamIds: string[];
}

/**
 * ADR-154 §3/§6 — everything the confirmation has to be able to say BEFORE anything is
 * pressed: whether the team is on court right now, and how close it is to disbanding.
 */
export interface TeamRepairContext {
  teamName: string;
  memberCount: number;
  liveMatchCourtName: string | null;
}

export function fetchTeamRepairContext(teamId: string): Promise<TeamRepairContext> {
  return apiGet(`/api/admin/teams/${teamId}/repair-context`);
}

export function moveTeamMember(body: {
  participantId: string;
  fromTeamId: string;
  toTeamId: string;
}): Promise<{ from: string; withdrawal: WithdrawalView | null }> {
  return apiPost('/api/admin/teams/members/move', body);
}

export function addTeamMemberAsStaff(
  teamId: string,
  participantId: string,
): Promise<{ ok: boolean }> {
  return apiPost(`/api/admin/teams/${teamId}/members`, { participantId });
}

export function removeTeamMemberAsStaff(
  teamId: string,
  participantId: string,
): Promise<{ outcome: string; withdrawal: WithdrawalView | null }> {
  return apiRemove(`/api/admin/teams/${teamId}/members/${participantId}`);
}

export function setTeamCaptainAsStaff(
  teamId: string,
  participantId: string,
): Promise<{ ok: boolean }> {
  return apiPost(`/api/admin/teams/${teamId}/captain`, { participantId });
}

export function unlockTeamAsStaff(teamId: string): Promise<{ ok: boolean }> {
  return apiPost(`/api/admin/teams/${teamId}/unlock`);
}

/** ADR-161 — the whole day in one object, so the sheet and the CSVs cannot disagree. */
export function fetchFinalStandings(): Promise<{ standings: FinalStandingsView }> {
  return apiGet('/api/admin/standings/final');
}

export function fetchVoidAudit(): Promise<{ items: VoidAuditEntryView[] }> {
  return apiGet('/api/admin/void-audit');
}

export function fetchSuperadmins(): Promise<{ items: SuperadminView[] }> {
  return apiGet('/api/admin/superadmins');
}

export function createSuperadmin(body: {
  username: string;
  passcode: string;
}): Promise<{ superadmin: SuperadminView }> {
  return apiPost('/api/admin/superadmins', body);
}

export function updateSuperadminPasscode(input: {
  superadminId: string;
  passcode: string;
}): Promise<{ superadmin: SuperadminView }> {
  return apiPut(`/api/admin/superadmins/${input.superadminId}/passcode`, {
    passcode: input.passcode,
  });
}

/**
 * ADR-118 — the operations switch.
 *
 * `canRestart` arrives beside the state rather than inside it because it describes the process
 * answering the request, not a decision anybody made about the event: a deployment with no
 * supervisor cannot restart itself, and the console needs to say so before the button is pressed
 * rather than after a 503 comes back.
 */
/**
 * ADR-118 — `canRestart` travels beside the state, never inside it. The pause is an event-day
 * decision the database remembers; supervision is a property of the process answering this
 * request. Folding the second into the first would invite someone to persist it.
 */
export interface ServiceStateResponse {
  state: ServiceStateView;
  canRestart: boolean;
}

export function fetchServiceState(): Promise<ServiceStateResponse> {
  return apiGet('/api/admin/service-state');
}

export function pauseSocial(): Promise<{ state: ServiceStateView }> {
  return apiPost('/api/admin/service-state/pause-social', {});
}

/**
 * ADR-147 — station offline mode. Two named calls rather than one taking a boolean: what is
 * being turned on is code that outlives the page, and a reader of this file should not have
 * to follow an argument to find out which way the switch went.
 */
export function enableStationOffline(): Promise<{ state: ServiceStateView }> {
  return apiPost('/api/admin/service-state/enable-station-offline', {});
}

export function disableStationOffline(): Promise<{ state: ServiceStateView }> {
  return apiPost('/api/admin/service-state/disable-station-offline', {});
}

export function resumeSocial(): Promise<{ state: ServiceStateView }> {
  return apiPost('/api/admin/service-state/resume-social', {});
}

export function restartServer(): Promise<{ restarting: boolean; message: string }> {
  return apiPost('/api/admin/system/restart', {});
}

/**
 * ADR-307 — the system reset's two calls. The challenge is asked for first and shown
 * to the operator, who types it back with their own passcode; the challenge is the
 * server's invention, spent by the attempt whether it succeeds or not.
 */
export function requestSystemResetChallenge(): Promise<{ confirmation: string; expiresAt: string }> {
  return apiPost('/api/admin/system/reset/challenge', {});
}

export function resetSystem(body: {
  passcode: string;
  confirmation: string;
}): Promise<{ reset: SystemResetView }> {
  return apiPost('/api/admin/system/reset', body);
}

/**
 * ADR-140/145 — the hall screen's keys.
 *
 * `createScreenKey` is the only call in this file whose response carries a live credential,
 * and the only one that ever should: the token comes back once, with no way to ask for it
 * again. Everything else about a key — what it is called, when it was last used, whether it
 * is still good — is on the list.
 */
export function fetchScreenKeys(): Promise<{ items: ScreenKeyView[] }> {
  return apiGet('/api/admin/screen-keys');
}

export function createScreenKey(
  label: string,
  enabledScenes: readonly ScreenSceneId[],
): Promise<{ screenKey: ScreenKeyView; token: string }> {
  return apiPost('/api/admin/screen-keys', { label, enabledScenes });
}

/** ADR-160 — change what an existing screen shows, without touching the projector. */
export function setScreenKeyScenes(
  screenKeyId: string,
  enabledScenes: readonly ScreenSceneId[],
): Promise<{ screenKey: ScreenKeyView }> {
  return apiPatch(`/api/admin/screen-keys/${screenKeyId}/scenes`, { enabledScenes });
}

export function revokeScreenKey(screenKeyId: string): Promise<{ screenKey: ScreenKeyView }> {
  return apiPost(`/api/admin/screen-keys/${screenKeyId}/revoke`, {});
}
