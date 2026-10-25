import type { PointConfigView } from '@psd/contracts';
import type { PointConfigRecord } from '../db/entities/pointConfig.js';
import { iso } from '../lib/http.js';

/** fds.md §2.12 — the day's fringe point settings (ADR-270 moved this out of the tournament views). */
export function pointConfigView(record: PointConfigRecord): PointConfigView {
  return {
    fringeParticipationPoints: record.fringeParticipationPoints,
    fringePassportBonusPoints: record.fringePassportBonusPoints,
    fringePassportStations: record.fringePassportStations,
    updatedAt: iso(record.updatedAt),
    updatedByUsername: record.updatedByUsername,
  };
}
