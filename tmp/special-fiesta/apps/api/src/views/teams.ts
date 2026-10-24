import { avatarSpriteId } from '@psd/contracts';
import type { TeamDetailView, TeamMemberView, TeamSummaryView } from '@psd/contracts';
import type { TeamMemberRecord, TeamSummaryRecord } from '../db/entities/teams.js';
import { iso } from '../lib/http.js';
import { asClusterCode } from './participants.js';

export function teamSummaryView(record: TeamSummaryRecord): TeamSummaryView {
  return {
    id: record.id,
    teamName: record.teamName,
    captainNickname: record.captainNickname,
    memberCount: Number(record.memberCount),
    isLocked: record.isLocked,
    createdAt: iso(record.createdAt),
  };
}

export function teamMemberView(record: TeamMemberRecord): TeamMemberView {
  return {
    participantId: record.participantId,
    nickname: record.nickname,
    clusterCode: asClusterCode(record.clusterCode),
    gender: record.gender,
    avatarVariant: record.avatarVariant,
    avatarLook: record.avatarLook,
    avatarPhotoId: record.avatarPhoto ? avatarSpriteId(record.avatarPhoto) : null,
    title: record.title,
    isCaptain: record.isCaptain,
    joinedAt: iso(record.joinedAt),
  };
}

export interface TeamDetailInput {
  summary: TeamSummaryRecord;
  members: TeamMemberRecord[];
  viewerParticipantId: string | null;
}

/**
 * S10/S11 — the join code is a member-only secret, so it is omitted for non-members
 * (fds.md §5.1: browse shows name, member count, captain, lock status — not the code).
 */
export function teamDetailView(input: TeamDetailInput): TeamDetailView {
  const members = input.members.map(teamMemberView);
  const viewerMembership = input.members.find(
    (member) => member.participantId === input.viewerParticipantId,
  );
  const isMember = Boolean(viewerMembership);
  return {
    ...teamSummaryView(input.summary),
    members,
    joinCode: isMember ? input.summary.joinCode : null,
    viewerIsMember: isMember,
    viewerIsCaptain: Boolean(viewerMembership?.isCaptain),
  };
}
