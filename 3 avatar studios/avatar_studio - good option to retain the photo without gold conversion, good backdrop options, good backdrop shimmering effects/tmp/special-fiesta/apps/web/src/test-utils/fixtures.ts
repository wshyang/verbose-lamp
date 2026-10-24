import type {
  ActivityView,
  CourtView,
  MatchView,
  ParticipantView,
  RoundView,
  ScanView,
  SessionView,
  TeamDetailView,
} from '@psd/contracts';

/** Canonical view objects for tests, shaped exactly like the API's responses. */

export const participantFixture: ParticipantView = {
  id: '11111111-1111-4111-8111-111111111111',
  nickname: 'BeachBoss',
  clusterCode: 'BP',
  gender: 'female',
  avatarVariant: 3,
  avatarLook: '3-1-2-1-1-1',
  avatarPhotoId: null,
  // ADR-061 — every participant wears one of the energetic words.
  title: 'Pathfinder',
  // ADR-088 — the spoken manual-entry number; public, unlike the PIN.
  scanNumber: '0742',
  createdAt: '2026-09-29T01:00:00.000Z',
};

export const participantSession: SessionView = {
  actorType: 'participant',
  participant: participantFixture,
};

export const facilitatorSession: SessionView = {
  actorType: 'facilitator',
  staff: { id: '22222222-2222-4222-8222-222222222222', username: 'fringe1', displayLabel: 'Volleyball' },
  defaultStation: { type: 'fringe_activity', id: 'activity-1', label: 'Beach Volleyball Rally' },
};

export const superadminSession: SessionView = {
  actorType: 'superadmin',
  staff: { id: '33333333-3333-4333-8333-333333333333', username: 'superadmin', displayLabel: null },
};

export const roundFixture: RoundView = {
  id: 'round-1',
  activityId: 'activity-1',
  roundNumber: 1,
  status: 'open',
  openedAt: '2026-09-29T02:00:00.000Z',
  closedAt: null,
  openedByUsername: 'fringe1',
  scanCount: 0,
};

export const activityFixture: ActivityView = {
  id: 'activity-1',
  activityName: 'Beach Volleyball Rally',
  awardTiers: [{ label: 'Award', points: 15 }],
  isActive: true,
  assignedFacilitatorId: null,
  assignedFacilitatorUsername: null,
  createdAt: '2026-09-29T01:30:00.000Z',
  currentRound: roundFixture,
};

export const scanFixture: ScanView = {
  id: 'scan-1',
  participantId: participantFixture.id,
  participantNickname: participantFixture.nickname,
  clusterCode: 'BP',
  roundId: roundFixture.id,
  activityId: activityFixture.id,
  activityNameSnapshot: activityFixture.activityName,
  roundNumberSnapshot: 1,
  pointsAwardedSnapshot: 15,
  tierLabelSnapshot: 'Award',
  facilitatorUsernameSnapshot: 'fringe1',
  clientScanUuid: 'client-uuid-1',
  clientTimestamp: '2026-09-29T02:05:00.000Z',
  scannedAt: '2026-09-29T02:05:01.000Z',
  isVoided: false,
  undoneAt: null,
};

export const courtFixture: CourtView = {
  id: 'court-1',
  courtNumber: 1,
  displayLabel: 'Court 1 — Palawan',
  isEnabled: true,
  assignedFacilitatorId: null,
  assignedFacilitatorUsername: null,
  currentMatchId: null,
};

export const matchFixture: MatchView = {
  id: 'match-1',
  courtId: courtFixture.id,
  courtLabel: courtFixture.displayLabel,
  teamAId: 'team-a',
  teamAName: 'Sandstorm',
  teamBId: 'team-b',
  teamBName: 'Wave Riders',
  status: 'in_progress',
  scoreA: 0,
  scoreB: 0,
  winnerTeamId: null,
  winnerTeamName: null,
  startedByFacilitatorId: 'facilitator-1',
  startedByUsername: 'court1',
  startedAt: '2026-09-29T02:10:00.000Z',
  completedAt: null,
  winPointsSnapshot: null,
  lossPointsSnapshot: null,
  drawPointsSnapshot: null,
  stage: 'group',
  isVoided: false,
  lastEditedAt: null,
  editReason: null,
};

export const completedMatchFixture: MatchView = {
  ...matchFixture,
  status: 'completed',
  winnerTeamId: 'team-a',
  winnerTeamName: 'Sandstorm',
  completedAt: '2026-09-29T02:30:00.000Z',
  winPointsSnapshot: 10,
  lossPointsSnapshot: 3,
  drawPointsSnapshot: null,
  stage: 'group',
};

export const teamFixture: TeamDetailView = {
  id: 'team-a',
  teamName: 'Sandstorm',
  captainNickname: participantFixture.nickname,
  memberCount: 2,
  isLocked: false,
  createdAt: '2026-09-29T01:45:00.000Z',
  joinCode: 'ABC234',
  viewerIsMember: true,
  viewerIsCaptain: true,
  members: [
    {
      participantId: participantFixture.id,
      nickname: participantFixture.nickname,
      clusterCode: 'BP',
      gender: 'female',
      avatarVariant: 3,
      avatarLook: '5-2-6-1-2-4',
      avatarPhotoId: null,
      title: 'Pathfinder',
      isCaptain: true,
      joinedAt: '2026-09-29T01:45:00.000Z',
    },
    {
      participantId: '44444444-4444-4444-8444-444444444444',
      nickname: 'SandSprinter',
      clusterCode: 'CS',
      gender: 'male',
      avatarVariant: 2,
      avatarLook: '2-3-1-2-5-2',
      avatarPhotoId: null,
      title: 'Trailblazer',
      isCaptain: false,
      joinedAt: '2026-09-29T01:50:00.000Z',
    },
  ],
};
