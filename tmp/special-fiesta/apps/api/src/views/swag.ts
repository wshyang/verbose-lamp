import type { SwagClaimView, SwagRoundView, SwagStationView } from '@psd/contracts';
import type { SwagClaimRecord, SwagRoundRecord } from '../db/entities/swag.js';
import type { SwagStationRow } from '../db/schema/index.js';
import { iso } from '../lib/http.js';
import { asClusterCode } from './participants.js';

/** ADR-110 — the swag views, shaped like their fringe twins. */

export function swagRoundView(record: SwagRoundRecord): SwagRoundView {
  return {
    id: record.id,
    stationId: record.stationId,
    roundNumber: record.roundNumber,
    status: record.status,
    openedAt: iso(record.openedAt),
    closedAt: record.closedAt ? iso(record.closedAt) : null,
    openedByUsername: record.openedByUsername,
    claimCount: Number(record.claimCount),
  };
}

export function swagStationView(
  row: SwagStationRow,
  currentRound: SwagRoundRecord | null,
): SwagStationView {
  return {
    id: row.id,
    stationName: row.stationName,
    items: row.items,
    isActive: row.isActive,
    createdAt: iso(row.createdAt),
    currentRound: currentRound ? swagRoundView(currentRound) : null,
  };
}

export function swagClaimView(record: SwagClaimRecord): SwagClaimView {
  return {
    id: record.id,
    participantId: record.participantId,
    participantNickname: record.participantNickname,
    clusterCode: asClusterCode(record.clusterCode),
    stationId: record.stationId,
    stationNameSnapshot: record.stationNameSnapshot,
    roundNumberSnapshot: record.roundNumberSnapshot,
    itemLabelSnapshot: record.itemLabelSnapshot,
    facilitatorUsernameSnapshot: record.facilitatorUsernameSnapshot,
    claimedAt: iso(record.claimedAt),
    isVoided: record.isVoided,
    undoneAt: record.undoneAt ? iso(record.undoneAt) : null,
  };
}
