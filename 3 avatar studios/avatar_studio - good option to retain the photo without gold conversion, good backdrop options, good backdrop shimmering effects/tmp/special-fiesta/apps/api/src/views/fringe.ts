import type { ActivityView, RoundView, ScanView } from '@psd/contracts';
import type { ActivityRecord } from '../db/entities/activities.js';
import type { RoundRecord } from '../db/entities/rounds.js';
import type { ScanRecord } from '../db/entities/scans.js';
import { iso, isoOrNull } from '../lib/http.js';
import { asClusterCode } from './participants.js';

export function roundView(record: RoundRecord): RoundView {
  return {
    id: record.id,
    activityId: record.activityId,
    roundNumber: record.roundNumber,
    status: record.status,
    openedAt: iso(record.openedAt),
    closedAt: isoOrNull(record.closedAt),
    openedByUsername: record.openedByUsername,
    scanCount: Number(record.scanCount),
  };
}

export interface ActivityViewInput {
  activity: ActivityRecord;
  currentRound: RoundRecord | null;
}

export function activityView(input: ActivityViewInput): ActivityView {
  return {
    id: input.activity.id,
    activityName: input.activity.activityName,
    awardTiers: input.activity.awardTiers,
    isActive: input.activity.isActive,
    assignedFacilitatorId: input.activity.assignedFacilitatorId,
    assignedFacilitatorUsername: input.activity.assignedFacilitatorUsername,
    createdAt: iso(input.activity.createdAt),
    currentRound: input.currentRound ? roundView(input.currentRound) : null,
  };
}

export function scanView(record: ScanRecord): ScanView {
  return {
    id: record.id,
    participantId: record.participantId,
    participantNickname: record.participantNickname,
    clusterCode: asClusterCode(record.clusterCode),
    roundId: record.roundId,
    activityId: record.activityId,
    activityNameSnapshot: record.activityNameSnapshot,
    roundNumberSnapshot: record.roundNumberSnapshot,
    pointsAwardedSnapshot: record.pointsAwardedSnapshot,
    tierLabelSnapshot: record.tierLabelSnapshot,
    facilitatorUsernameSnapshot: record.facilitatorUsernameSnapshot,
    clientScanUuid: record.clientScanUuid,
    clientTimestamp: iso(record.clientTimestamp),
    scannedAt: iso(record.scannedAt),
    isVoided: record.isVoided,
    undoneAt: record.undoneAt === null ? null : iso(record.undoneAt),
  };
}
