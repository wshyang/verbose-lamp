import { boolean, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { superadminAccounts } from './identity.js';

/**
 * fds.md §2.12 #obj-pointconfig — the day's singleton point settings.
 *
 * ADR-270 — fringe settings only. The tournament's rates and pacing left this row with the old
 * tournament tables: a tournament now carries its own rates, so the row a fringe station reads is no
 * longer also the gate that decided whether a court could start a match.
 */
export const pointConfigs = pgTable('point_config', {
  id: uuid('id').primaryKey(),
  singleton: boolean('singleton').notNull().default(true),
  // ADR-116 — the day's participation floor, what turning up is worth when you do not place.
  fringeParticipationPoints: integer('fringe_participation_points').notNull().default(5),
  // ADR-176 — the passport bonus and the distinct-station count that earns it; 0 means off.
  fringePassportBonusPoints: integer('fringe_passport_bonus_points').notNull().default(0),
  fringePassportStations: integer('fringe_passport_stations').notNull().default(4),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBySuperadminId: uuid('updated_by_superadmin_id')
    .notNull()
    .references(() => superadminAccounts.id),
});

export type PointConfigRow = typeof pointConfigs.$inferSelect;
