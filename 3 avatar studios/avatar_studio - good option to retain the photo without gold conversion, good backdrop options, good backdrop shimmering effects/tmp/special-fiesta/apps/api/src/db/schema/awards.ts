import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { superadminAccounts } from './identity.js';
import { teams } from './teams.js';

/**
 * ADR-005 — who was on a team when something was paid to it, frozen so the money does not move when the
 * roster does. ADR-270 moved the type here when the match table that first carried it was removed: the
 * award batch is now its home, and the rebuilt tournament's roster bridge reuses the same grammar.
 */
export interface RosterSnapshotEntry {
  participantId: string;
  nickname: string;
  clusterCode: string;
}

/**
 * ADR-248 — the award batch: the ledger of what a team was given, and the unit that can be taken back.
 *
 * The two tables are deliberately asymmetric. `team_award` holds the money and nothing else, and
 * `award_batch` holds every word about why: a row that restated its header would be two answers to one
 * question the moment somebody corrected the header. The header's `is_reversed` is the *only* reversal
 * anywhere — the rows are never deleted, because ADR-117's reason for append-only holds for a team
 * ledger exactly as it does for the participant one — and so every reader that counts has to filter on
 * it, which is the work this feature is (ADR-159's lesson, learned in advance rather than after).
 *
 * `clientBatchUuid` is the offline queue's key, ADR-009's idiom from `fringe_scan`. It is what lets a
 * twenty-row POST be retried after a timeout without becoming twenty more rows, and it is the only
 * duplicate the write cares about: there is deliberately no guard against awarding the same team twice,
 * because the owner asked for that freedom and the preview is where a repeat is shown rather than here
 * where it would be refused.
 */
export const awardBatches = pgTable(
  'award_batch',
  {
    id: uuid('id').primaryKey(),
    clientBatchUuid: uuid('client_batch_uuid').notNull().unique(),
    label: text('label').notNull(),
    reason: text('reason').notNull(),
    createdBySuperadminId: uuid('created_by_superadmin_id')
      .notNull()
      .references(() => superadminAccounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    isReversed: boolean('is_reversed').notNull().default(false),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBySuperadminId: uuid('reversed_by_superadmin_id').references(() => superadminAccounts.id),
    reversedReason: text('reversed_reason'),
  },
  (batch) => [uniqueIndex('ux_award_batch_client').on(batch.clientBatchUuid)],
);

/**
 * One team's side of one batch. Same bounds as `score_adjustment` (`points <> 0`, ±100) because it is
 * the same object with a different subject, and the same `rosterSnapshot` shape because the CTE on the
 * board that pays the money out to people is the one that reads a match's roster.
 */
export const teamAwards = pgTable(
  'team_award',
  {
    id: uuid('id').primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => awardBatches.id),
    points: integer('points').notNull(),
    rosterSnapshot: jsonb('roster_snapshot').$type<RosterSnapshotEntry[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Plain indexes, exactly the two schema.sql creates: a team may be awarded again tomorrow, and a batch
  // may hold twenty teams, so uniqueness on either column would be a duplicate guard wearing an index.
  (award) => [index('ix_team_award_team').on(award.teamId), index('ix_team_award_batch').on(award.batchId)],
);

export type AwardBatchRow = typeof awardBatches.$inferSelect;
export type TeamAwardRow = typeof teamAwards.$inferSelect;
