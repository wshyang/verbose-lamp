import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { participants } from './identity.js';

/** Team domain — fds.md §2.3/§2.4. Membership removal is soft (expires_at). */

export const teams = pgTable('team', {
  id: uuid('id').primaryKey(),
  teamName: text('team_name').notNull(),
  joinCode: text('join_code').notNull(),
  captainParticipantId: uuid('captain_participant_id')
    .notNull()
    .references(() => participants.id),
  isLocked: boolean('is_locked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  disbandedAt: timestamp('disbanded_at', { withTimezone: true }),
});

export const teamMemberships = pgTable('team_membership', {
  id: uuid('id').primaryKey(),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id),
  isCaptain: boolean('is_captain').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  /** ADR-063 — how far this member has read the team room; a high-water mark, not an FK. */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export type TeamRow = typeof teams.$inferSelect;
export type TeamMembershipRow = typeof teamMemberships.$inferSelect;
