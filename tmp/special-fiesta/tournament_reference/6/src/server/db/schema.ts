import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type {
  MatchStatus,
  ParticipantSlot,
  PointEntryKind,
  TournamentStatus,
} from '../../shared/contracts.js';

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  mode: varchar('mode', { length: 40 }).notNull(),
  status: varchar('status', { length: 20 }).$type<TournamentStatus>().notNull(),
  teamCount: integer('team_count').notNull(),
  courtCount: integer('court_count').notNull(),
  matchDurationMinutes: integer('match_duration_minutes').notNull(),
  tournamentLengthMinutes: integer('tournament_length_minutes').notNull(),
  startTimeMinutes: integer('start_time_minutes').notNull(),
  winPoints: integer('win_points').notNull().default(3),
  drawPoints: integer('draw_points').notNull().default(1),
  lossPoints: integer('loss_points').notNull().default(0),
  closingReason: text('closing_reason'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 80 }).notNull(),
    seed: integer('seed').notNull(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true, mode: 'string' }),
    withdrawalReason: varchar('withdrawal_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('teams_tournament_idx').on(table.tournamentId),
    uniqueIndex('teams_active_name_unique')
      .on(table.tournamentId, table.name)
      .where(sql`withdrawn_at IS NULL`),
  ],
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 80 }).notNull(),
    phase: varchar('phase', { length: 80 }).notNull(),
    roundNumber: integer('round_number').notNull(),
    groupKey: varchar('group_key', { length: 80 }),
    position: integer('position').notNull(),
    status: varchar('status', { length: 20 }).$type<MatchStatus>().notNull(),
    homeSlot: jsonb('home_slot').$type<ParticipantSlot>().notNull(),
    awaySlot: jsonb('away_slot').$type<ParticipantSlot>().notNull(),
    dependsOn: jsonb('depends_on').$type<string[]>().notNull().default([]),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    courtNumber: integer('court_number').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    winnerTeamId: uuid('winner_team_id').references(() => teams.id, {
      onDelete: 'restrict',
    }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('matches_tournament_code_unique').on(table.tournamentId, table.code),
    index('matches_tournament_round_idx').on(
      table.tournamentId,
      table.roundNumber,
      table.position,
    ),
    index('matches_tournament_court_idx').on(
      table.tournamentId,
      table.courtNumber,
      table.startMinute,
    ),
  ],
);

export const pointEntries = pgTable(
  'point_entries',
  {
    id: uuid('id').primaryKey(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'restrict' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'restrict' }),
    kind: varchar('kind', { length: 24 }).$type<PointEntryKind>().notNull(),
    points: integer('points').notNull(),
    reason: varchar('reason', { length: 500 }).notNull(),
    voidsEntryId: uuid('voids_entry_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('point_entries_tournament_team_idx').on(table.tournamentId, table.teamId),
    uniqueIndex('point_entries_void_unique')
      .on(table.voidsEntryId)
      .where(sql`voids_entry_id IS NOT NULL`),
  ],
);

export const schema = { tournaments, teams, matches, pointEntries };
