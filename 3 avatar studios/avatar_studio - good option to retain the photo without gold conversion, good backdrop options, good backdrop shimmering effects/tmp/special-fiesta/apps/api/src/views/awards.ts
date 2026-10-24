import type { AwardBatchDetailView, AwardBatchView, TeamAwardView } from '@psd/contracts';
import type { AwardBatchRecord, AwardBatchSummary, TeamAwardRecord } from '../db/entities/awards.js';
import { iso } from '../lib/http.js';
import { adjustmentView } from './participants.js';

/**
 * ADR-248 — the award batch as the console reads it.
 *
 * The totals are not stored anywhere: they are the rows added up at the last moment, which is what lets a
 * reversal change what a batch is worth on the board without revising a single number on the register. A
 * `total_points` column on the header would have had to be rewritten by every reversal, and ADR-006 has
 * kept the board out of that business for its whole life for reasons that have not aged.
 *
 * Note what the two sums mean, because they are not the same question. Here a reversed batch still reports
 * what it paid — the register is the record of a decision, and a decision of 15 points stays a decision of
 * 15 points whether or not it stands. What the batch is worth NOW is a board question, and it is answered
 * in `leaderboard.ts` and in `teamLedgerView` below, where the reversed lines come out.
 */

export function awardBatchView(summary: AwardBatchSummary): AwardBatchView {
  const header = summary.header;
  return {
    id: header.id,
    clientBatchUuid: header.clientBatchUuid,
    label: header.label,
    reason: header.reason,
    createdByUsername: header.createdByUsername,
    createdAt: iso(header.createdAt),
    isReversed: header.isReversed,
    reversedAt: header.reversedAt === null ? null : iso(header.reversedAt),
    reversedByUsername: header.reversedByUsername,
    reversedReason: header.reversedReason,
    teamTotal: summary.teamTotal,
    participantTotal: summary.participantTotal,
    teamCount: summary.teamCount,
    participantCount: summary.participantCount,
  };
}

export function awardBatchDetailView(record: AwardBatchRecord): AwardBatchDetailView {
  return {
    ...awardBatchView({
      header: record.header,
      teamCount: record.teamAwards.length,
      teamTotal: sumBy(record.teamAwards),
      participantCount: record.participantAwards.length,
      participantTotal: sumBy(record.participantAwards),
    }),
    teams: record.teamAwards.map(teamAwardView),
    adjustments: record.participantAwards.map(adjustmentView),
  };
}

export function teamAwardView(row: TeamAwardRecord): TeamAwardView {
  return {
    id: row.id,
    teamId: row.teamId,
    teamName: row.teamName,
    points: row.points,
    participantIds: row.participantIds,
    createdAt: iso(row.createdAt),
    batchLabel: row.batchLabel,
    batchReversed: row.batchReversed,
  };
}

/**
 * A team's ledger: the awards it was given, and what they are worth with the reversed ones taken out.
 *
 * Both halves travel together on purpose. The console shows the first and promises the second — "the ledger
 * already holds +12, this batch makes it +32" — and if the preview added rows the register had filtered
 * out, the number it offered would be a number nothing would ever agree with.
 */
export function teamLedgerView(rows: TeamAwardRecord[]): {
  rows: TeamAwardView[];
  liveTotal: number;
} {
  return { rows: rows.map(teamAwardView), liveTotal: sumBy(rows.filter((row) => !row.batchReversed)) };
}

function sumBy(rows: readonly { points: number }[]): number {
  return rows.reduce((total, row) => total + row.points, 0);
}
