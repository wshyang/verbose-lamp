import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { facilitatorAccounts, participants } from './identity.js';

/**
 * ADR-110 — the swag counter: fringe's twin that hands out items, not points. Same round
 * lifecycle, same snapshot discipline; the difference is that a claim consumes allowance
 * (per participant, per item, per round) instead of awarding anything.
 */

export interface SwagItem {
  label: string;
  limit: number;
}

export const swagStations = pgTable('swag_station', {
  id: uuid('id').primaryKey(),
  stationName: text('station_name').notNull(),
  items: jsonb('items').$type<SwagItem[]>().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const swagRounds = pgTable('swag_round', {
  id: uuid('id').primaryKey(),
  stationId: uuid('station_id')
    .notNull()
    .references(() => swagStations.id),
  roundNumber: integer('round_number').notNull(),
  status: text('status', { enum: ['open', 'closed', 'ended'] }).notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  openedByFacilitatorId: uuid('opened_by_facilitator_id')
    .notNull()
    .references(() => facilitatorAccounts.id),
});

export const swagClaims = pgTable('swag_claim', {
  id: uuid('id').primaryKey(),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id),
  roundId: uuid('round_id')
    .notNull()
    .references(() => swagRounds.id),
  stationId: uuid('station_id')
    .notNull()
    .references(() => swagStations.id),
  facilitatorId: uuid('facilitator_id')
    .notNull()
    .references(() => facilitatorAccounts.id),
  stationNameSnapshot: text('station_name_snapshot').notNull(),
  roundNumberSnapshot: integer('round_number_snapshot').notNull(),
  itemLabelSnapshot: text('item_label_snapshot').notNull(),
  facilitatorUsernameSnapshot: text('facilitator_username_snapshot').notNull(),
  clientClaimUuid: uuid('client_claim_uuid').notNull().unique(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  // ADR-159 — a voided claim is still a row, and no longer consumes allowance.
  isVoided: boolean('is_voided').notNull().default(false),
  // ADR-159 (mirrors ADR-138) — the counter's own take-back, told apart from a superadmin void.
  undoneAt: timestamp('undone_at', { withTimezone: true }),
});

export type SwagStationRow = typeof swagStations.$inferSelect;
export type SwagRoundRow = typeof swagRounds.$inferSelect;
export type SwagClaimRow = typeof swagClaims.$inferSelect;
