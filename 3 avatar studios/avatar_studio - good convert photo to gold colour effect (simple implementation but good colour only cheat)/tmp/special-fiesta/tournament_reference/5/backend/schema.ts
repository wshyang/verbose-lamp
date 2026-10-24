import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { SlotSource, TournamentConfig } from '../shared/types.js';

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  mode: text('mode').notNull(),
  status: text('status').notNull(),
  config: jsonb('config').$type<TournamentConfig>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id),
  name: text('name').notNull(),
  seed: integer('seed').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const courts = pgTable('courts', {
  id: uuid('id').primaryKey(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id),
  name: text('name').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const matches = pgTable('matches', {
  id: uuid('id').primaryKey(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id),
  matchKey: text('match_key').notNull(),
  phase: text('phase').notNull(),
  groupKey: text('group_key'),
  round: integer('round').notNull(),
  slotA: jsonb('slot_a').$type<SlotSource>().notNull(),
  slotB: jsonb('slot_b').$type<SlotSource>().notNull(),
  dependsOn: jsonb('depends_on').$type<string[]>().notNull(),
  courtId: uuid('court_id').references(() => courts.id),
  startMinutes: integer('start_minutes'),
  endMinutes: integer('end_minutes'),
  status: text('status').notNull(),
  scoreA: integer('score_a'),
  scoreB: integer('score_b'),
  origin: text('origin').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const pointsEntries = pgTable('points_entries', {
  id: uuid('id').primaryKey(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  matchId: uuid('match_id').references(() => matches.id),
  points: integer('points').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull(),
  voidReason: text('void_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
