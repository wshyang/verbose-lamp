import type { ClusterCode, TeamChatMessageKind } from '@psd/contracts';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clusters, facilitatorAccounts, participants, superadminAccounts } from './identity.js';
import { teams } from './teams.js';

/**
 * Chat domain (ADR-046) — one global room, every actor type may post.
 * Drizzle is the only property→column mapper in this repository (AGENTS-database.md §1).
 *
 * `authorLabelSnapshot` and `clusterCodeSnapshot` are frozen at write time rather than joined
 * on read (AGENTS.md non-negotiable #7): a nickname change must not rewrite what the room saw
 * an hour ago, the same reason FringeScan freezes its activity name.
 */

export const chatMessages = pgTable('chat_message', {
  id: uuid('id').primaryKey(),
  authorType: text('author_type').$type<'participant' | 'facilitator' | 'superadmin'>().notNull(),
  participantId: uuid('participant_id').references(() => participants.id),
  facilitatorId: uuid('facilitator_id').references(() => facilitatorAccounts.id),
  superadminId: uuid('superadmin_id').references(() => superadminAccounts.id),
  authorLabelSnapshot: text('author_label_snapshot').notNull(),
  clusterCodeSnapshot: text('cluster_code_snapshot')
    .$type<ClusterCode>()
    .references(() => clusters.code),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  hiddenAt: timestamp('hidden_at', { withTimezone: true }),
});

export type ChatMessageRow = typeof chatMessages.$inferSelect;

/**
 * ADR-063 — a team's own room, in its own table.
 *
 * Separate from `chatMessages` so the global room's routes physically cannot read it. The author
 * is always a participant, so there is no three-way exclusive check here; `teams` is imported
 * lazily through the reference callback, which is how Drizzle avoids a circular module.
 */
export const teamChatMessages = pgTable('team_chat_message', {
  id: uuid('id').primaryKey(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id),
  /** ADR-063 — a spoken line, or a roster event that makes the room the team's history. */
  kind: text('kind').$type<TeamChatMessageKind>().notNull().default('said'),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id),
  authorLabelSnapshot: text('author_label_snapshot').notNull(),
  /** ADR-061 — the energetic word, frozen as it was when they spoke. */
  titleSnapshot: text('title_snapshot').notNull(),
  /** Null for a roster event: its sentence is UI copy, not stored text. */
  body: text('body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  hiddenAt: timestamp('hidden_at', { withTimezone: true }),
});

export type TeamChatMessageRow = typeof teamChatMessages.$inferSelect;

/**
 * ADR-074 — a staff announcement.
 *
 * In the chat domain file because it shares the "something said to everybody" shape, but a table of
 * its own: it is delivered as a toast rather than as a line in a room, and it is retracted for
 * everybody rather than hidden from one reader.
 *
 * There is deliberately **no dismissal column and no dismissal table here.** Whether a reader has
 * clicked a toast away lives in that browser (`apps/web/src/lib/storage/announcementStore.ts`), which
 * is what keeps the live read identical for every participant and therefore shareable as one
 * `cachedRead`. A per-reader row would have shared nothing and accumulated all day.
 */
export const announcements = pgTable('announcement', {
  id: uuid('id').primaryKey(),
  superadminId: uuid('superadmin_id')
    .notNull()
    .references(() => superadminAccounts.id),
  authorLabelSnapshot: text('author_label_snapshot').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  retractedAt: timestamp('retracted_at', { withTimezone: true }),
});

export type AnnouncementRow = typeof announcements.$inferSelect;
