import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AwardTier, TournamentDraftSetup } from "@psd/contracts";
import type { PipelineSpec } from "@psd/tournament/scheduler";
import type { RosterSnapshotEntry } from "./awards.js";
import { teams } from "./teams.js";

/**
 * ADR-275 — the rebuilt tournament's tables, mirrored from `schema.sql` (docs/design/tournament-engine.md §2).
 *
 * Three groups, and the arrows between them are the architecture (ADR-272): the core tables point at
 * the app only through `tournament_entrant.team_id`; the scheduler's tables point at the core; the
 * points bridge (app side) points at both. Nothing in the core points at the scheduler.
 */

type ActorKind = "facilitator" | "superadmin" | "system";

/** ADR-293 — which game type the tournament is for. Orthogonal to format (bracket shape). ADR-321 adds dumb courts. */
export type TournamentKind = "captains_ball" | "dumb_courts";

export const tournamentCourts = pgTable("tournament_court", {
  id: uuid("id").primaryKey(),
  courtNumber: integer("court_number").notNull(),
  label: text("label").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tournaments = pgTable("tournament", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").$type<"draft" | "live" | "closed">().notNull(),
  kind: text("kind").$type<TournamentKind>().notNull().default("captains_ball"),
  /** ADR-313 — the Start configuration saved with a draft, before Start finalises it. */
  draftSetup: jsonb("draft_setup").$type<TournamentDraftSetup | null>(),
  /** ADR-321 — dumb courts only: the point tiers court masters award from, as configured at creation. */
  dumbTiers: jsonb("dumb_tiers").$type<AwardTier[] | null>(),
  winPoints: integer("win_points").notNull(),
  drawPoints: integer("draw_points").notNull(),
  lossPoints: integer("loss_points").notNull(),
  createdByKind: text("created_by_kind").$type<ActorKind>().notNull(),
  createdById: uuid("created_by_id").notNull(),
  createdByLabel: text("created_by_label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closeReason: text("close_reason"),
  /** ADR-336 — when the day stopped taking new matches, or null. Never cleared: there is no resume. */
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  revision: integer("revision").notNull().default(0),
});

/**
 * ADR-336 — the one-way switch, recorded where it happened: the bracket it retired, the award day it
 * created, the tiers snapshotted and who confirmed. Append-only; no `resumed_at`, because no command
 * in the core can return a bracket to fixtures (that would be a new ADR, and a new command with it).
 *
 * The row is the mode's memory as well as the audit. `readOperatingMode` reads it before it reads the
 * tournament rows, and the drain reads its `reason` to close the retired bracket — with the switch's
 * own words rather than a sentence invented at the end of the day.
 */
export const tournamentModeChanges = pgTable("tournament_mode_change", {
  id: uuid("id").primaryKey(),
  fixturesTournamentId: uuid("fixtures_tournament_id")
    .notNull()
    .references(() => tournaments.id),
  dumbTournamentId: uuid("dumb_tournament_id")
    .notNull()
    .references(() => tournaments.id),
  /** ADR-336 §4 — the award buttons the day began with, snapshotted so an edit rewrites no history. */
  tiers: jsonb("tiers").$type<AwardTier[]>().notNull(),
  reason: text("reason").notNull(),
  switchedById: uuid("switched_by_id").notNull(),
  switchedByLabel: text("switched_by_label").notNull(),
  switchedAt: timestamp("switched_at", { withTimezone: true }).notNull(),
  /** Minted by the desk before it posts: a retried switch replays the first one (ADR-009's idiom). */
  clientUuid: uuid("client_uuid").notNull().unique(),
});

export type TournamentModeChangeRow = typeof tournamentModeChanges.$inferSelect;

/**
 * ADR-336 §5.4 — a facilitator's ask to switch the day, soft-resolved and never deleted. One pending
 * ask at a time (a partial unique index in `schema.sql`), because two marshals pressing at once should
 * stack into one question for the desk rather than two banners.
 */
export const tournamentModeRequests = pgTable('tournament_mode_request', {
  id: uuid('id').primaryKey(),
  requestedById: uuid('requested_by_id').notNull(),
  requestedByLabel: text('requested_by_label').notNull(),
  reason: text('reason').notNull(),
  /** Where the ask came from, when it came from a court. Informative, never authority. */
  courtId: uuid('court_id').references(() => tournamentCourts.id),
  clientUuid: uuid('client_uuid').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  /** ADR-342 — never written: the ask outlives any deadline. Kept nullable for pre-342 databases. */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolution: text('resolution').$type<'confirmed' | 'declined' | 'expired'>(),
  resolvedByLabel: text('resolved_by_label'),
  declineReason: text('decline_reason'),
});

export type TournamentModeRequestRow = typeof tournamentModeRequests.$inferSelect;

export const tournamentEntrants = pgTable("tournament_entrant", {
  id: uuid("id").primaryKey(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  nameSnapshot: text("name_snapshot").notNull(),
  entryOrder: integer("entry_order").notNull(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  withdrawReason: text("withdraw_reason"),
});

export const tournamentStages = pgTable("tournament_stage", {
  id: uuid("id").primaryKey(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id),
  code: text("code").notNull(),
  ordinal: integer("ordinal").notNull(),
  label: text("label").notNull(),
  kind: text("kind").$type<"pool" | "bracket" | "swiss" | "open">().notNull(),
  allowsDraws: boolean("allows_draws").notNull(),
  advanceCount: integer("advance_count").notNull().default(0),
  winPoints: integer("win_points"),
  drawPoints: integer("draw_points"),
  lossPoints: integer("loss_points"),
  /** ADR-320 — the stage's internal table points (ranking only, never paid); NULL = default 3/1/0. */
  tableWinPoints: integer("table_win_points"),
  tableDrawPoints: integer("table_draw_points"),
  tableLossPoints: integer("table_loss_points"),
  /** ADR-325 — the feeding stage and how many it sends on; both NULL for a stage dealt from the entered teams. */
  intakeStageId: uuid("intake_stage_id").references(
    (): AnyPgColumn => tournamentStages.id,
  ),
  intakeCount: integer("intake_count"),
  status: text("status").$type<"pending" | "active" | "completed">().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completionReason: text("completion_reason"),
});

/** ADR-325 — who came through to a fed stage, frozen when its feeder closes. Append-only. */
export const tournamentStageEntrants = pgTable(
  "tournament_stage_entrant",
  {
    stageId: uuid("stage_id")
      .notNull()
      .references(() => tournamentStages.id),
    entrantId: uuid("entrant_id")
      .notNull()
      .references(() => tournamentEntrants.id),
    place: integer("place").notNull(),
  },
  (row) => [primaryKey({ columns: [row.stageId, row.entrantId] })],
);

export const tournamentGroups = pgTable(
  "tournament_group",
  {
    id: uuid("id").primaryKey(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => tournamentStages.id),
    code: text("code").notNull(),
    label: text("label").notNull(),
    /** ADR-334 — set when a restage replaces this group; the row is kept, never deleted. */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  // ADR-334 — one live group per code in a stage; replaced groups keep their code as history.
  (row) => [
    uniqueIndex("ux_tournament_group_stage_code_live")
      .on(row.stageId, row.code)
      .where(sql`superseded_at IS NULL`),
  ],
);

export const tournamentGroupEntrants = pgTable(
  "tournament_group_entrant",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => tournamentGroups.id),
    entrantId: uuid("entrant_id")
      .notNull()
      .references(() => tournamentEntrants.id),
    seed: integer("seed").notNull(),
  },
  (row) => [primaryKey({ columns: [row.groupId, row.entrantId] })],
);

export const tournamentMatches = pgTable("tournament_match", {
  id: uuid("id").primaryKey(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id),
  stageId: uuid("stage_id")
    .notNull()
    .references(() => tournamentStages.id),
  groupId: uuid("group_id").references(() => tournamentGroups.id),
  code: text("code").notNull(),
  round: integer("round").notNull(),
  sequence: integer("sequence").notNull(),
  origin: text("origin").$type<"structure" | "ad_hoc">().notNull(),
  isPlacement: boolean("is_placement").notNull().default(false),
  status: text("status")
    .$type<
      "scheduled" | "in_progress" | "completed" | "cancelled" | "superseded"
    >()
    .notNull(),
  courtId: uuid("court_id").references(() => tournamentCourts.id),
  plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
  plannedMinutes: integer("planned_minutes").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  startedByKind: text("started_by_kind").$type<ActorKind>(),
  startedById: uuid("started_by_id"),
  startedByLabel: text("started_by_label"),
  scoreA: integer("score_a").notNull().default(0),
  scoreB: integer("score_b").notNull().default(0),
  resultKind: text("result_kind").$type<"score" | "walkover" | "bye">(),
  winnerSide: text("winner_side").$type<"a" | "b">(),
  isVoided: boolean("is_voided").notNull().default(false),
  cancelReason: text("cancel_reason"),
  version: integer("version").notNull().default(0),
});

export type SlotSourceKind =
  | "entrant"
  | "winner_of"
  | "loser_of"
  | "group_place"
  | "stage_place"
  | "pairing"
  | "vacant";

export const tournamentSlots = pgTable(
  "tournament_slot",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => tournamentMatches.id),
    side: text("side").$type<"a" | "b">().notNull(),
    sourceKind: text("source_kind").$type<SlotSourceKind>().notNull(),
    sourceEntrantId: uuid("source_entrant_id").references(
      () => tournamentEntrants.id,
    ),
    sourceMatchId: uuid("source_match_id").references(
      (): AnyPgColumn => tournamentMatches.id,
    ),
    sourceGroupId: uuid("source_group_id").references(
      () => tournamentGroups.id,
    ),
    sourceStageId: uuid("source_stage_id").references(
      () => tournamentStages.id,
    ),
    sourcePlace: integer("source_place"),
    sourceRound: integer("source_round"),
    label: text("label").notNull(),
    seatedEntrantId: uuid("seated_entrant_id").references(
      () => tournamentEntrants.id,
    ),
    seatOverrideReason: text("seat_override_reason"),
  },
  (row) => [primaryKey({ columns: [row.matchId, row.side] })],
);

export const tournamentAwards = pgTable("tournament_award", {
  id: uuid("id").primaryKey(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id),
  entrantId: uuid("entrant_id")
    .notNull()
    .references(() => tournamentEntrants.id),
  matchId: uuid("match_id").references(() => tournamentMatches.id),
  kind: text("kind").$type<"result" | "manual">().notNull(),
  points: integer("points").notNull(),
  reason: text("reason").notNull(),
  createdByKind: text("created_by_kind").$type<ActorKind>().notNull(),
  createdById: uuid("created_by_id").notNull(),
  createdByLabel: text("created_by_label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
});

/**
 * ADR-321 — dumb-court bookkeeping for one manual award: which court and tier it came from, and the
 * client-minted id that makes a double-tap replay instead of double-pay. The award itself stays an
 * ordinary engine award; this extension row is the only dumb-specific storage (core stays minimal).
 */
export const tournamentDumbAwards = pgTable("tournament_dumb_award", {
  awardId: uuid("award_id")
    .primaryKey()
    .references(() => tournamentAwards.id),
  courtId: uuid("court_id")
    .notNull()
    .references(() => tournamentCourts.id),
  tierLabel: text("tier_label").notNull(),
  clientUuid: uuid("client_uuid").notNull().unique(),
});

export const tournamentEvents = pgTable("tournament_event", {
  id: uuid("id").primaryKey(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id),
  at: timestamp("at", { withTimezone: true }).notNull(),
  actorKind: text("actor_kind").$type<ActorKind>().notNull(),
  actorId: uuid("actor_id").notNull(),
  actorLabel: text("actor_label").notNull(),
  kind: text("kind").notNull(),
  matchId: uuid("match_id").references(() => tournamentMatches.id),
  reason: text("reason"),
  detail: jsonb("detail")
    .$type<Record<string, string | number | boolean | null>>()
    .notNull()
    .default({}),
});

/** ADR-275 — the scheduler's own tables. They point at the core; the core never points back. */
export const tournamentSchedulers = pgTable("tournament_scheduler", {
  tournamentId: uuid("tournament_id")
    .primaryKey()
    .references(() => tournaments.id),
  format: text("format").notNull(),
  /** ADR-334 — the exact stage plan Start used, kept so an unstarted stage can be rebuilt. */
  pipelineSpec: jsonb("pipeline_spec").$type<PipelineSpec | null>(),
  options: jsonb("options")
    .$type<Record<string, string | number | boolean>>()
    .notNull()
    .default({}),
  status: text("status").$type<"active" | "terminated">().notNull(),
  matchMinutes: integer("match_minutes").notNull(),
  changeoverMinutes: integer("changeover_minutes").notNull(),
  restMinutes: integer("rest_minutes").notNull(),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  autoAdvance: boolean("auto_advance").notNull().default(true),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  terminatedAt: timestamp("terminated_at", { withTimezone: true }),
  terminatedByLabel: text("terminated_by_label"),
  terminateReason: text("terminate_reason"),
  revision: integer("revision").notNull().default(0),
});

export const tournamentSchedulerPins = pgTable("tournament_scheduler_pin", {
  matchId: uuid("match_id")
    .primaryKey()
    .references(() => tournamentMatches.id),
  pinnedBy: text("pinned_by").notNull(),
  pinnedAt: timestamp("pinned_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
});

/** ADR-276 — the points bridge: who on a team a tournament payment reached, frozen when it was made. */
export const tournamentMatchRosters = pgTable(
  "tournament_match_roster",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => tournamentMatches.id),
    entrantId: uuid("entrant_id")
      .notNull()
      .references(() => tournamentEntrants.id),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    rosterSnapshot: jsonb("roster_snapshot")
      .$type<RosterSnapshotEntry[]>()
      .notNull(),
  },
  (row) => [primaryKey({ columns: [row.matchId, row.entrantId] })],
);

export const tournamentAwardRosters = pgTable("tournament_award_roster", {
  awardId: uuid("award_id")
    .primaryKey()
    .references(() => tournamentAwards.id),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  rosterSnapshot: jsonb("roster_snapshot")
    .$type<RosterSnapshotEntry[]>()
    .notNull(),
});

export type TournamentCourtRow = typeof tournamentCourts.$inferSelect;
export type TournamentRow = typeof tournaments.$inferSelect;
export type TournamentEntrantRow = typeof tournamentEntrants.$inferSelect;
export type TournamentStageRow = typeof tournamentStages.$inferSelect;
export type TournamentGroupRow = typeof tournamentGroups.$inferSelect;
export type TournamentGroupEntrantRow =
  typeof tournamentGroupEntrants.$inferSelect;
export type TournamentMatchRow = typeof tournamentMatches.$inferSelect;
export type TournamentSlotRow = typeof tournamentSlots.$inferSelect;
export type TournamentAwardRow = typeof tournamentAwards.$inferSelect;
export type TournamentEventRow = typeof tournamentEvents.$inferSelect;
export type TournamentSchedulerRow = typeof tournamentSchedulers.$inferSelect;
