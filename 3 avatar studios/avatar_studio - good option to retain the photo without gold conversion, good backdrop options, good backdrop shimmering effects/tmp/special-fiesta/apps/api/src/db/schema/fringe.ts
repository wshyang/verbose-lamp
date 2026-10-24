import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { AwardTier } from '@psd/contracts';
import { facilitatorAccounts, participants, superadminAccounts } from './identity.js';
import { awardBatches } from './awards.js';

/** Fringe domain — fds.md §2.7/§2.8/§2.9. Scans are immutable except the void flag. */

export const fringeActivities = pgTable('fringe_activity', {
  id: uuid('id').primaryKey(),
  activityName: text('activity_name').notNull(),
  // ADR-092 — ordered award tiers; a flat-rate station is simply a single-tier list.
  awardTiers: jsonb('award_tiers').$type<AwardTier[]>().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  assignedFacilitatorId: uuid('assigned_facilitator_id').references(() => facilitatorAccounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fringeRounds = pgTable('fringe_round', {
  id: uuid('id').primaryKey(),
  activityId: uuid('activity_id')
    .notNull()
    .references(() => fringeActivities.id),
  roundNumber: integer('round_number').notNull(),
  status: text('status').$type<'open' | 'closed' | 'ended'>().notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  openedByFacilitatorId: uuid('opened_by_facilitator_id')
    .notNull()
    .references(() => facilitatorAccounts.id),
});

export const fringeScans = pgTable('fringe_scan', {
  id: uuid('id').primaryKey(),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id),
  roundId: uuid('round_id')
    .notNull()
    .references(() => fringeRounds.id),
  activityId: uuid('activity_id')
    .notNull()
    .references(() => fringeActivities.id),
  facilitatorId: uuid('facilitator_id')
    .notNull()
    .references(() => facilitatorAccounts.id),
  activityNameSnapshot: text('activity_name_snapshot').notNull(),
  roundNumberSnapshot: integer('round_number_snapshot').notNull(),
  pointsAwardedSnapshot: integer('points_awarded_snapshot').notNull(),
  tierLabelSnapshot: text('tier_label_snapshot').notNull(),
  facilitatorUsernameSnapshot: text('facilitator_username_snapshot').notNull(),
  clientScanUuid: uuid('client_scan_uuid').notNull(),
  clientTimestamp: timestamp('client_timestamp', { withTimezone: true }).notNull(),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
  isVoided: boolean('is_voided').notNull().default(false),
  // ADR-138 — set when the station undid its own award inside the window; never by a superadmin.
  undoneAt: timestamp('undone_at', { withTimezone: true }),
});

/**
 * ADR-117 — the superadmin's manual correction ledger. Append-only: no void flag, no update
 * path. A mistaken adjustment is answered with an equal and opposite one.
 */
/**
 * ADR-118 — the operations switch (S61). One row at most; its absence means full service.
 */
export const serviceStates = pgTable('service_state', {
  id: uuid('id').primaryKey(),
  singleton: boolean('singleton').notNull().default(true),
  isSocialPaused: boolean('is_social_paused').notNull().default(false),
  isStationOfflineEnabled: boolean('is_station_offline_enabled').notNull().default(false),
  stationOfflineUpdatedAt: timestamp('station_offline_updated_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBySuperadminId: uuid('updated_by_superadmin_id')
    .notNull()
    .references(() => superadminAccounts.id),
});

export type ServiceStateRow = typeof serviceStates.$inferSelect;

export const scoreAdjustments = pgTable('score_adjustment', {
  id: uuid('id').primaryKey(),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id),
  activityId: uuid('activity_id')
    .notNull()
    .references(() => fringeActivities.id),
  points: integer('points').notNull(),
  reason: text('reason').notNull(),
  activityNameSnapshot: text('activity_name_snapshot').notNull(),
  // Mirrored so a correction can be attributed to its operator through a typed join; the FK itself is
  // the schema.sql one, which is the constraint that actually holds.
  createdBySuperadminId: uuid('created_by_superadmin_id')
    .notNull()
    .references(() => superadminAccounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // ADR-248 — the batch this was posted with. Nullable by decision: NULL keeps meaning "one row, at the
  // desk", which is what every row already in the ledger is, and a NOT NULL would have rewritten that
  // history to satisfy a column that has not existed until now.
  batchId: uuid('batch_id').references(() => awardBatches.id),
});

export type ScoreAdjustmentRow = typeof scoreAdjustments.$inferSelect;
export type FringeActivityRow = typeof fringeActivities.$inferSelect;
export type FringeRoundRow = typeof fringeRounds.$inferSelect;
export type FringeScanRow = typeof fringeScans.$inferSelect;
