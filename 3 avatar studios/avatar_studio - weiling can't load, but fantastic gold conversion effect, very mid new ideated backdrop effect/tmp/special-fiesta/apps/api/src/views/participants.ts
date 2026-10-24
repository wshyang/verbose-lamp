import { avatarSpriteId } from '@psd/contracts';
import type {
  ClusterCode,
  ParticipantTotalsView,
  ParticipantView,
  ScoreAdjustmentView,
  ServiceStateView,
} from '@psd/contracts';
import type { AdjustmentRecord } from '../db/entities/adjustments.js';
import type { ClusterRecord } from '../db/entities/clusters.js';
import { FULL_SERVICE } from '../db/entities/serviceState.js';
import type { ServiceStateRecord } from '../db/entities/serviceState.js';
import type { ParticipantTotalsRecord } from '../db/entities/leaderboard.js';
import type { ParticipantRow } from '../db/schema/index.js';
import { iso } from '../lib/http.js';

/**
 * View builders shape wire responses (AGENTS-database.md §1): they may drop, join and order
 * fields for the client, but they never re-spell a column name — Drizzle already did that.
 */

export function asClusterCode(value: string): ClusterCode {
  return value as ClusterCode;
}

export function participantView(row: ParticipantRow): ParticipantView {
  return {
    id: row.id,
    nickname: row.nickname,
    clusterCode: asClusterCode(row.clusterCode),
    gender: row.gender,
    avatarVariant: row.avatarVariant,
    avatarLook: row.avatarLook,
    avatarPhotoId: row.avatarPhoto ? avatarSpriteId(row.avatarPhoto) : null,
    title: row.title,
    scanNumber: row.scanNumber,
    createdAt: iso(row.createdAt),
  };
}

export function participantTotalsView(record: ParticipantTotalsRecord): ParticipantTotalsView {
  const fringePoints = Number(record.fringe_points);
  const tournamentPoints = Number(record.tournament_points);
  const stationsVisited = Number(record.stations_visited);
  const stationsRequired = Number(record.passport_stations_required);
  const bonusPoints = Number(record.passport_bonus_points);
  return {
    fringePoints,
    tournamentPoints,
    totalPoints: fringePoints + tournamentPoints,
    scanCount: Number(record.scan_count),
    // ADR-176 — earned is the same comparison the leaderboard's HAVING makes, so the card and
    // the board can never disagree about whether the bonus has been paid.
    passport: {
      stationsVisited,
      stationsRequired,
      bonusPoints,
      isEarned: bonusPoints > 0 && stationsVisited >= stationsRequired,
    },
  };
}

/** ADR-117 — a correction, named by the station it belongs to and the person who made it. */
export function adjustmentView(record: AdjustmentRecord): ScoreAdjustmentView {
  return {
    id: record.id,
    participantId: record.participantId,
    activityId: record.activityId,
    points: record.points,
    reason: record.reason,
    activityName: record.activityNameSnapshot,
    createdByUsername: record.createdByUsername,
    createdAt: iso(record.createdAt),
    // ADR-248 — the batch this came in with, marked rather than hidden: a register shows what was
    // decided, and the reversal is part of what was decided.
    batchId: record.batchId,
    batchLabel: record.batchLabel,
    batchReversed: record.batchReversed,
  };
}

/**
 * ADR-118 — an absent row is full service, so the view answers for the un-paused day too
 * rather than making every caller handle null.
 */
export function serviceStateView(state: ServiceStateRecord | null): ServiceStateView {
  if (!state) return { ...FULL_SERVICE };
  return {
    isSocialPaused: state.isSocialPaused,
    updatedAt: state.updatedAt.toISOString(),
    updatedByUsername: state.updatedByUsername,
    isStationOfflineEnabled: state.isStationOfflineEnabled,
    stationOfflineUpdatedAt: state.stationOfflineUpdatedAt?.toISOString() ?? null,
  };
}

/**
 * ADR-172 — S44 a catalogue row for the superadmin console.
 *
 * `memberCount` travels with every row because it is the reason a retire will be refused, and
 * the console should be able to say so before the superadmin presses the button rather than
 * after.
 */
export function clusterView(record: ClusterRecord) {
  return {
    code: record.code,
    displayName: record.displayName,
    memberCount: record.memberCount,
    retiredAt: record.retiredAt?.toISOString() ?? null,
    isRetired: record.retiredAt !== null,
  };
}
