import { desc, eq, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { SCOREBOARD_TAG, invalidateTag } from '../../lib/cache.js';
import { newId } from '../ids.js';
import { awardBatches, scoreAdjustments, superadminAccounts } from '../schema/index.js';
import type { ScoreAdjustmentRow } from '../schema/index.js';
import { firstOrThrow } from '../rows.js';

/**
 * ADR-117 #obj-scoreadjustment — the manual correction ledger.
 *
 * Append-only by design. There is no void and no edit: an adjustment entered in error is
 * answered with an equal and opposite one, so the ledger reads as a history of decisions
 * rather than a mutable opinion about the past.
 */

export interface AdjustmentRecord extends ScoreAdjustmentRow {
  createdByUsername: string;
  /**
   * ADR-248 — the batch this was posted with, and what became of it. NULL and false for a row entered at
   * the desk on its own. The ledger is a register rather than a total, so a reversed batch is shown and
   * marked here: hiding it would delete a decision from the record of decisions, which is the one thing
   * ADR-117's append-only rule exists to prevent. The readers that COUNT points are where the filter
   * goes — and they have it (`adjustment_points` in `leaderboard.ts`).
   */
  batchLabel: string | null;
  // A row that came in on its own has no batch to have been taken back by, which is why the null side of
  // the left join is spelled as a condition rather than folded into a default.
  batchReversed: boolean;
}

function adjustmentQuery(db: Executor) {
  return db
    .select({
      id: scoreAdjustments.id,
      participantId: scoreAdjustments.participantId,
      activityId: scoreAdjustments.activityId,
      points: scoreAdjustments.points,
      reason: scoreAdjustments.reason,
      activityNameSnapshot: scoreAdjustments.activityNameSnapshot,
      createdBySuperadminId: scoreAdjustments.createdBySuperadminId,
      batchId: scoreAdjustments.batchId,
      createdAt: scoreAdjustments.createdAt,
      createdByUsername: superadminAccounts.username,
      batchLabel: awardBatches.label,
      batchReversed: sql<boolean>`${scoreAdjustments.batchId} IS NOT NULL AND ${awardBatches.isReversed}`.as('batch_reversed'),
    })
    .from(scoreAdjustments)
    .innerJoin(
      superadminAccounts,
      eq(superadminAccounts.id, scoreAdjustments.createdBySuperadminId),
    )
    .leftJoin(awardBatches, eq(awardBatches.id, scoreAdjustments.batchId));
}

export interface NewAdjustment {
  participantId: string;
  activityId: string;
  points: number;
  reason: string;
  activityNameSnapshot: string;
  createdBySuperadminId: string;
  /** ADR-248 — set when the row arrives as part of a batch. The batch is the thing that can be taken back. */
  batchId?: string | undefined;
}

export async function createAdjustment(
  db: Executor,
  input: NewAdjustment,
): Promise<AdjustmentRecord> {
  const written = firstOrThrow(
    await db
      .insert(scoreAdjustments)
      .values({ id: newId(), ...input })
      .returning(),
    'Adjustment insert returned no row',
  );
  // ADR-038 — a correction moves the standings exactly as an award does.
  invalidateTag(SCOREBOARD_TAG);
  return firstOrThrow(
    await adjustmentQuery(db).where(eq(scoreAdjustments.id, written.id)),
    'Adjustment read-back found nothing',
  );
}

/** Newest first: during an incident the most recent decision is the one being discussed. */
export async function listAdjustmentsForParticipant(
  db: Executor,
  participantId: string,
): Promise<AdjustmentRecord[]> {
  return adjustmentQuery(db)
    .where(eq(scoreAdjustments.participantId, participantId))
    .orderBy(desc(scoreAdjustments.createdAt));
}

/**
 * ADR-248 — the participant half of one batch. Its own reader rather than a filter on the participant's
 * list, because the register asks what the batch paid and only the batch knows; biggest line first, since
 * that is the one anyone is arguing about.
 */
export async function listAdjustmentsForBatch(
  db: Executor,
  batchId: string,
): Promise<AdjustmentRecord[]> {
  return adjustmentQuery(db)
    .where(eq(scoreAdjustments.batchId, batchId))
    .orderBy(desc(scoreAdjustments.points));
}
