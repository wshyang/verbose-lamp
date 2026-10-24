import { and, eq, ne } from "drizzle-orm";
import type { AwardTier, TournamentDraftSetup } from "@psd/contracts";
import type { Actor, TournamentKind } from "@psd/tournament/core";
import type { AppDatabase, AppTransaction, Executor } from "../db/client.js";
import { newId } from "../db/ids.js";
import {
  tournamentCourts,
  tournamentEntrants,
  tournaments,
  type TournamentCourtRow,
} from "../db/schema/index.js";
import { firstOrNull, firstOrThrow } from "../db/rows.js";

/**
 * ADR-279 — the core adapter's setup writes: the venue's courts, and a draft tournament with its
 * entrants. Everything after the draft is an engine command (`commands.ts`) or the scheduler's
 * activation; these are the rows that exist before there is anything for the engine to decide.
 *
 * Entrants arrive as the app's team ids with the names they carry today, and are snapshotted: the
 * core never reads the team table (ADR-272), so the caller hands the names in.
 */

export interface CourtInput {
  courtNumber: number;
  label: string;
}

export type CourtOutcome =
  | { ok: true; court: TournamentCourtRow }
  | { ok: false; reason: "number_taken" | "not_found" };

async function isNumberTaken(
  db: Executor,
  input: { courtNumber: number; exceptId: string | null },
): Promise<boolean> {
  const sameNumber = eq(tournamentCourts.courtNumber, input.courtNumber);
  const where =
    input.exceptId === null
      ? sameNumber
      : and(sameNumber, ne(tournamentCourts.id, input.exceptId));
  return (
    (
      await db
        .select({ id: tournamentCourts.id })
        .from(tournamentCourts)
        .where(where)
    ).length > 0
  );
}

export async function createCourt(
  db: AppDatabase,
  input: CourtInput,
): Promise<CourtOutcome> {
  if (
    await isNumberTaken(db, { courtNumber: input.courtNumber, exceptId: null })
  )
    return { ok: false, reason: "number_taken" };
  const rows = await db
    .insert(tournamentCourts)
    .values({ id: newId(), courtNumber: input.courtNumber, label: input.label })
    .returning();
  return { ok: true, court: firstOrThrow(rows, "court insert") };
}

export async function updateCourt(
  db: AppDatabase,
  input: CourtInput & { id: string },
): Promise<CourtOutcome> {
  if (
    await isNumberTaken(db, {
      courtNumber: input.courtNumber,
      exceptId: input.id,
    })
  )
    return { ok: false, reason: "number_taken" };
  const [court] = await db
    .update(tournamentCourts)
    .set({ courtNumber: input.courtNumber, label: input.label })
    .where(eq(tournamentCourts.id, input.id))
    .returning();
  return court === undefined
    ? { ok: false, reason: "not_found" }
    : { ok: true, court };
}

/** §3.4 — a soft switch: a match already on the court plays on; only new starts are refused. */
export async function setCourtEnabled(
  db: AppDatabase,
  input: { id: string; isEnabled: boolean },
): Promise<CourtOutcome> {
  const [court] = await db
    .update(tournamentCourts)
    .set({ isEnabled: input.isEnabled })
    .where(eq(tournamentCourts.id, input.id))
    .returning();
  return court === undefined
    ? { ok: false, reason: "not_found" }
    : { ok: true, court };
}

export interface DraftInput {
  name: string;
  /** ADR-293 — which game type this tournament is for. Defaults to 'captains_ball'. */
  kind?: TournamentKind;
  rates: { win: number; draw: number; loss: number };
  /** Seed order: the first entrant is seed 1. Names as the teams are called today. */
  entrants: readonly { teamId: string; name: string }[];
  /** ADR-313 — the Start configuration saved with the draft, if any. It schedules nothing. */
  setup?: TournamentDraftSetup | null | undefined;
  /** ADR-321 — dumb courts only: the award tiers court masters will use, snapshotted at creation. */
  tiers?: readonly AwardTier[] | null | undefined;
  createdBy: Actor;
}

export type DraftOutcome =
  { ok: true; tournamentId: string } | { ok: false; reason: "already_open" };

/**
 * A draft and its entrants, in one transaction. At most one tournament per kind is open
 * (`ux_tournament_one_open_per_kind`, ADR-293 superseding ADR-273).
 */
export async function createDraft(
  db: AppDatabase,
  input: DraftInput,
): Promise<DraftOutcome> {
  return db.transaction((tx) => createDraftIn(tx, input));
}

/**
 * ADR-336 — the draft write inside a transaction the caller opened. The switch creates the dumb
 * tournament, pauses the bracket and logs the decision in one commit, so a failure half way through
 * leaves the room exactly as it was rather than with a dumb day nobody asked for.
 */
export async function createDraftIn(
  tx: AppTransaction,
  input: DraftInput,
): Promise<DraftOutcome> {
  {
    const kind: TournamentKind = input.kind ?? "captains_ball";
    // Defense-in-depth: the DB index ux_tournament_one_open_per_kind enforces this, but a
    // clear app-level check gives a human-readable reason instead of a constraint violation.
    const open = firstOrNull(
      await tx
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(
          and(ne(tournaments.status, "closed"), eq(tournaments.kind, kind)),
        )
        .limit(1),
    );
    if (open !== null) return { ok: false, reason: "already_open" };
    const id = newId();
    await tx.insert(tournaments).values({
      id,
      name: input.name,
      status: "draft",
      kind,
      winPoints: input.rates.win,
      drawPoints: input.rates.draw,
      lossPoints: input.rates.loss,
      createdByKind: input.createdBy.kind,
      createdById: input.createdBy.id,
      createdByLabel: input.createdBy.label,
      draftSetup: input.setup ?? null,
      dumbTiers:
        input.tiers === undefined || input.tiers === null
          ? null
          : [...input.tiers],
    });
    const rows = input.entrants.map((entrant, index) => ({
      id: newId(),
      tournamentId: id,
      teamId: entrant.teamId,
      nameSnapshot: entrant.name,
      entryOrder: index + 1,
    }));
    await tx.insert(tournamentEntrants).values(rows);
    return { ok: true, tournamentId: id };
  }
}

/** Throws away a draft nobody started: closed with a reason, never deleted. */
export async function discardDraft(
  db: AppDatabase,
  input: { tournamentId: string; now: Date },
): Promise<boolean> {
  const closed = await db
    .update(tournaments)
    .set({
      status: "closed",
      closedAt: input.now,
      closeReason: "Discarded before it started.",
    })
    .where(
      and(
        eq(tournaments.id, input.tournamentId),
        eq(tournaments.status, "draft"),
      ),
    )
    .returning({ id: tournaments.id });
  return closed.length > 0;
}
