import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * ADR-177 — the day's programme, one row per item.
 *
 * Its own domain file rather than a corner of another: the agenda is read by participants, the
 * hall screen and the superadmin console, and it references nothing and nothing references it.
 * Drizzle is the only property→column mapper in this repository (AGENTS-database.md §1).
 *
 * `startsAt` is nullable because the real run sheet opens with a line that has no time — see the
 * comment on the table in `schema.sql` for why that is modelled as NULL rather than as a flag or
 * a nominal midnight.
 */
export const agendaItems = pgTable('agenda_item', {
  id: uuid('id').primaryKey(),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  title: text('title').notNull(),
  location: text('location'),
  detail: text('detail'),
  /** ADR-190 — hand-set order, used only to rank items that have no `startsAt` to rank them. */
  displayOrder: integer('display_order'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AgendaItemRow = typeof agendaItems.$inferSelect;
