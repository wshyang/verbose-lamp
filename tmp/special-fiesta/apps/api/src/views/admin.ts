import { avatarSpriteId } from '@psd/contracts';
import type {
  ClusterStandingView,
  FacilitatorView,
  IndividualStandingView,
  ScreenKeyView,
  SuperadminView,
  VoidAuditEntryView,
} from '@psd/contracts';
import type { FacilitatorRecord, AuditRecord } from '../db/entities/index.js';
import type {
  ClusterStandingRecord,
  IndividualStandingRecord,
} from '../db/entities/leaderboard.js';
import type { ScreenKeyRow, SuperadminRow } from '../db/schema/index.js';
import { iso, isoOrNull } from '../lib/http.js';
import { asClusterCode } from './participants.js';

export function facilitatorView(record: FacilitatorRecord): FacilitatorView {
  return {
    id: record.id,
    username: record.username,
    displayLabel: record.displayLabel,
    defaultStationType: record.defaultStationType,
    defaultStationId: record.defaultStationId,
    defaultStationLabel: record.defaultStationLabel,
    createdAt: iso(record.createdAt),
    lastLoginAt: isoOrNull(record.lastLoginAt),
    lastSeenAt: isoOrNull(record.lastSeenAt),
  };
}

export function superadminView(row: SuperadminRow): SuperadminView {
  return {
    id: row.id,
    username: row.username,
    createdAt: iso(row.createdAt),
    lastLoginAt: isoOrNull(row.lastLoginAt),
  };
}

export function auditView(record: AuditRecord): VoidAuditEntryView {
  return {
    id: record.id,
    targetType: record.targetType,
    targetId: record.targetId,
    action: record.action,
    reason: record.reason,
    performedByUsername: record.performedByUsername,
    performedAt: iso(record.performedAt),
  };
}

/** The driver hands timestamps back as a Date or as a string, depending on the column. */
function reachedIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return isoOrNull(new Date(value));
}

export function clusterStandingView(
  record: ClusterStandingRecord,
  index: number,
): ClusterStandingView {
  return {
    clusterCode: asClusterCode(record.cluster_code),
    displayName: record.display_name,
    fringePoints: Number(record.fringe_points),
    tournamentPoints: Number(record.tournament_points),
    totalPoints: Number(record.total_points),
    participantCount: Number(record.participant_count),
    rank: index + 1,
    // ADR-029 — the moment this total was reached, which is what breaks a tie.
    reachedAt: reachedIso(record.reached_at),
  };
}

export function individualStandingView(
  record: IndividualStandingRecord,
  index: number,
): IndividualStandingView {
  return {
    participantId: record.participant_id,
    nickname: record.nickname,
    clusterCode: asClusterCode(record.cluster_code),
    gender: record.gender,
    avatarVariant: record.avatar_variant,
    avatarLook: record.avatar_look,
    avatarPhotoId: record.avatar_photo ? avatarSpriteId(record.avatar_photo) : null,
    title: record.title,
    totalPoints: Number(record.total_points),
    rank: index + 1,
    reachedAt: reachedIso(record.reached_at),
  };
}

/** ADR-140 — never the token: it is shown once, at creation, and then only ever referenced. */
export function screenKeyView(row: ScreenKeyRow): ScreenKeyView {
  return {
    id: row.id,
    label: row.label,
    createdAt: iso(row.createdAt),
    lastSeenAt: iso(row.lastSeenAt),
    enabledScenes: row.enabledScenes,
    revokedAt: isoOrNull(row.expiresAt),
  };
}
