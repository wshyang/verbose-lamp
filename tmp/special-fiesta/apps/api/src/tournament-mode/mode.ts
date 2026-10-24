import { and, desc, eq } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import { firstOrNull } from "../db/rows.js";
import {
  tournamentMatches,
  tournamentModeChanges,
  tournaments,
  type TournamentModeChangeRow,
  type TournamentRow,
} from "../db/schema/index.js";

/**
 * ADR-336 — which game the room is playing, as one explicit answer.
 *
 * This folder is the composition root's own: it may read the core adapter and the scheduler, and
 * neither of them may import it (`check-standards.mjs`, rule `tournament-direction`). The reason is
 * the one ADR-272 already gives for the core not knowing the scheduler — "which tournament is the
 * room looking at" is cross-tournament orchestration, not a fact about any one tournament, so it
 * belongs to the layer that can see all of them.
 *
 * The problem it solves is an accidental one. Nothing today stops a dumb tournament being started
 * beside a live bracket, and when that happens the reads silently prefer the dumb day while the
 * bracket keeps planning underneath, with no agreed precedence and no audit. A mode that is read
 * from one place, and written by one guarded act, cannot be entered by accident.
 */

/**
 * `fixtures` — a bracket day, which is the ordinary case.
 * `switching` — the switch has been confirmed while a match is still live on some court, so the
 *   room is genuinely mixed: some courts award, some are still finishing. Phase 2 writes this;
 *   nothing can switch yet, so phase 1 never returns it.
 * `dumb` — the day is awarding points at the courts and nothing else.
 */
export type OperatingMode = "fixtures" | "switching" | "dumb";

/** Every live tournament, whatever kind, in one read. */
export async function liveTournaments(db: Executor): Promise<TournamentRow[]> {
  return db.select().from(tournaments).where(eq(tournaments.status, "live"));
}

/** The most recent switch, or null when the room has never switched. Append-only, so "most recent" is the answer. */
export async function latestModeSwitch(
  db: Executor,
): Promise<TournamentModeChangeRow | null> {
  return firstOrNull(
    await db
      .select()
      .from(tournamentModeChanges)
      .orderBy(desc(tournamentModeChanges.switchedAt))
      .limit(1),
  );
}

/** Matches still on a court in one tournament. The drain's whole question. */
export async function inProgressMatches(
  db: Executor,
  tournamentId: string,
): Promise<{ id: string; courtId: string | null }[]> {
  return db
    .select({ id: tournamentMatches.id, courtId: tournamentMatches.courtId })
    .from(tournamentMatches)
    .where(
      and(
        eq(tournamentMatches.tournamentId, tournamentId),
        eq(tournamentMatches.status, "in_progress"),
      ),
    );
}

/**
 * The mode the whole app reads. One function, because every surface that answers "which game is the
 * room playing" must answer it the same way, and phase 1's precedence is unchanged by the switch.
 *
 * ADR-336 §6.3 — the append-only `tournament_mode_change` log sits in front of the tournament rows:
 *
 *  - a live award day created by a switch is `switching` while the bracket it retired still has a
 *    match on a court, and `dumb` the moment nothing is left to drain;
 *  - a live award day nobody switched to (one built on the setup screen) is simply `dumb`;
 *  - with no award day live the room is back to `fixtures` — the switched bracket closes itself and
 *    its Results stand, which is a closed day, not a mode.
 *
 * The log is what makes the switch one-way: without it, a paused bracket beside a dumb day would be
 * indistinguishable from a mixed day and a caller could talk itself into "resuming" fixtures.
 */
export async function readOperatingMode(db: Executor): Promise<OperatingMode> {
  const live = await liveTournaments(db);
  const dumb = live.find((row) => row.kind === "dumb_courts");
  if (dumb === undefined) return "fixtures";
  const change = await latestModeSwitch(db);
  if (change !== null && change.dumbTournamentId === dumb.id) {
    const retired = live.find((row) => row.id === change.fixturesTournamentId);
    if (
      retired !== undefined &&
      (await inProgressMatches(db, retired.id)).length > 0
    )
      return "switching";
  }
  return "dumb";
}

/**
 * Is the room on court awards — including the mixed window while the drain finishes?
 *
 * (The two day-finders this folder used to export — the live-of-one-kind read and the desk's
 * draft — moved to the tournament's day-policy module at ADR-345: they were row-finders
 * answering "which tournament", which is the day policy's question, not the operating mode's.
 * This folder keeps what reads the mode itself.)
 */
export function isAwarding(mode: OperatingMode): boolean {
  return mode === "dumb" || mode === "switching";
}
