import { DEFAULT_AVATAR_LOOK_CODE } from '@psd/contracts';
import type { ScreenSceneId } from '@psd/contracts';
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Identity domain: clusters, participants and the two staff account types.
 * Drizzle is the only property→column mapper in this repository (AGENTS-database.md §1):
 * camelCase here, snake_case in Postgres, nothing hand-written in between.
 */

export const clusters = pgTable('cluster', {
  code: text('code').primaryKey(),
  displayName: text('display_name').notNull(),
  /** ADR-172 — set when a superadmin retires it. Never deleted; history snapshots point here. */
  retiredAt: timestamp('retired_at', { withTimezone: true }),
});

/**
 * ADR-061 — the catalogue of energetic words a participant can be called.
 *
 * A table rather than a Postgres `enum` or a bare text column: the words are data the organisers may
 * one day want to read or extend, a foreign key makes a typo impossible, and adding a word to an
 * `enum` type is a schema change where adding a row is not. Seeded at bootstrap from
 * `PARTICIPANT_TITLES`, the same way `cluster` is (ADR-007).
 */
export const participantTitles = pgTable('participant_title', {
  name: text('name').primaryKey(),
});

export const participants = pgTable('participant', {
  id: uuid('id').primaryKey(),
  nickname: text('nickname').notNull(),
  pin: text('pin').notNull(),
  clusterCode: text('cluster_code')
    .notNull()
    .references(() => clusters.code),
  gender: text('gender').$type<'male' | 'female'>().notNull(),
  avatarVariant: integer('avatar_variant').notNull(),
  avatarLook: text('avatar_look').notNull().default(DEFAULT_AVATAR_LOOK_CODE),
  avatarPhoto: text('avatar_photo'),
  /** ADR-061 — assigned at random on sign-up, worn all day, shown wherever "Trainer" used to be. */
  title: text('title')
    .notNull()
    .references(() => participantTitles.name),
  /**
   * ADR-088 — the spoken-aloud manual-entry number: random so it leaks neither sign-up order
   * nor headcount, a string because "0042" and 42 are different things. NOT the PIN.
   */
  scanNumber: text('scan_number').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  /**
   * ADR-083 — high-water mark for the global chat room, mirroring the team room's marker on
   * `team_membership`. NULL means "never opened the room", which reads as everything unread.
   */
});

export const facilitatorAccounts = pgTable('facilitator_account', {
  id: uuid('id').primaryKey(),
  username: text('username').notNull(),
  passcode: text('passcode').notNull(),
  displayLabel: text('display_label'),
  defaultStationType: text('default_station_type')
    .$type<'court' | 'fringe_activity' | 'none'>()
    .notNull()
    .default('none'),
  defaultStationId: uuid('default_station_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  /** ADR-151 — nullable: never signed in is not the same fact as signed in and gone quiet. */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const superadminAccounts = pgTable('superadmin_account', {
  id: uuid('id').primaryKey(),
  username: text('username').notNull(),
  passcode: text('passcode').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const sessions = pgTable('session', {
  id: uuid('id').primaryKey(),
  token: text('token').notNull(),
  actorType: text('actor_type').$type<'participant' | 'facilitator' | 'superadmin'>().notNull(),
  participantId: uuid('participant_id').references(() => participants.id),
  facilitatorId: uuid('facilitator_id').references(() => facilitatorAccounts.id),
  superadminId: uuid('superadmin_id').references(() => superadminAccounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export type ClusterRow = typeof clusters.$inferSelect;
export type ParticipantRow = typeof participants.$inferSelect;
export type FacilitatorRow = typeof facilitatorAccounts.$inferSelect;
export type SuperadminRow = typeof superadminAccounts.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type ScreenKeyRow = typeof screenKeys.$inferSelect;

/**
 * ADR-140 — a credential issued to a projector, not an account that signs in.
 *
 * It lives beside the staff accounts because it is the same kind of thing — something a
 * superadmin creates and revokes — and nowhere near `session`, because the whole point is that
 * it never becomes an `Actor`.
 */
export const screenKeys = pgTable('screen_key', {
  id: uuid('id').primaryKey(),
  label: text('label').notNull(),
  token: text('token').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => superadminAccounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  // ADR-160 — a subset of SCREEN_SCENES; never empty (enforced by a CHECK, not by hope).
  enabledScenes: jsonb('enabled_scenes').$type<ScreenSceneId[]>().notNull(),
});
