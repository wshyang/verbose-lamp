import { eq } from "drizzle-orm";
import { messages, type ModeSwitchView } from "@psd/contracts";
import type { Actor } from "@psd/tournament/core";
import type { AppDatabase } from "../db/client.js";
import { firstOrNull } from "../db/rows.js";
import {
  tournamentCourts,
  tournaments,
  type TournamentModeChangeRow,
  type TournamentRow,
} from "../db/schema/index.js";
import { createAnnouncement } from "../db/entities/index.js";
import { publishAnnouncement } from "../lib/statusBus.js";
import { announcementView } from "../views/announcements.js";
import { inProgressMatches, latestModeSwitch } from "./mode.js";
import { closeFixtures } from "./switch.js";

/**
 * ADR-336 §6 — the drain: what happens between the switch and the last court finishing.
 *
 * A switch taken at 14:20 will usually find a match or two on court. Those matches finish — the
 * switch never contradicts a marshal mid-game — and each court becomes an award station the moment
 * *its own* match is closed. The bracket then ends itself: the desk confirmed a switch, not a close,
 * and nothing should be left paused for somebody to notice.
 *
 * This module is the one place that answers "has the drain finished, and if so, end the bracket".
 * Every route where a match stops being in progress calls it after its own write, so the check is
 * never the thing that fails a completion: the completion has already committed, and a close that
 * refuses leaves the bracket paused with the desk able to close it by hand, which is the accepted
 * failure (§11).
 */

/** The system who ends the bracket: not a person, but the switch the desk confirmed. */
export const SWITCH_ACTOR: Actor = {
  kind: "system",
  id: "fac20000-0000-4000-8000-000000000001",
  label: "the switch",
};

export interface DrainState {
  change: TournamentModeChangeRow;
  fixtures: TournamentRow;
  dumb: TournamentRow;
  liveMatches: { id: string; courtId: string | null }[];
}

/**
 * The open switch, if the room is mid-drain.
 *
 * Null is the ordinary answer: no switch at all, or one whose bracket has already ended. A bracket
 * that is closed is not draining, which is what makes a repeated call a no-op rather than a second
 * close.
 */
export async function drainState(db: AppDatabase): Promise<DrainState | null> {
  const change = await latestModeSwitch(db);
  if (change === null) return null;
  const fixtures = firstOrNull(
    await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, change.fixturesTournamentId)),
  );
  if (fixtures === null || fixtures.status !== "live") return null;
  const dumb = firstOrNull(
    await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, change.dumbTournamentId)),
  );
  if (dumb === null) return null;
  return {
    change,
    fixtures,
    dumb,
    liveMatches: await inProgressMatches(db, fixtures.id),
  };
}

export interface DrainView {
  isDraining: boolean;
  courts: { courtId: string; courtLabel: string; isFinishing: boolean }[];
}

/** The desk's view of the drain: one line per court, so it can see what it is waiting for. */
export async function readDrain(
  db: AppDatabase,
  state?: DrainState | null,
): Promise<DrainView | null> {
  const draining = state === undefined ? await drainState(db) : state;
  if (draining === null) return null;
  const courts = await db.select().from(tournamentCourts);
  const busy = new Set(draining.liveMatches.map((match) => match.courtId));
  return {
    isDraining: draining.liveMatches.length > 0,
    courts: courts
      .sort((left, right) => left.courtNumber - right.courtNumber)
      .map((court) => ({
        courtId: court.id,
        courtLabel: court.label,
        isFinishing: busy.has(court.id),
      })),
  };
}

/**
 * The switch as the desk reads it back — the banner on the Control page, with the drain's per-court
 * lines while there is anything left to wait for. Null when the award day is over: the day after a
 * switch is a closed day, not a mode.
 */
export async function readModeSwitch(
  db: AppDatabase,
): Promise<ModeSwitchView | null> {
  const change = await latestModeSwitch(db);
  if (change === null) return null;
  const dumb = firstOrNull(
    await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, change.dumbTournamentId)),
  );
  if (dumb === null || dumb.status !== "live") return null;
  const fixtures = firstOrNull(
    await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, change.fixturesTournamentId)),
  );
  const state = await drainState(db);
  const drain = await readDrain(db, state);
  return {
    switchedAt: change.switchedAt.toISOString(),
    switchedByLabel: change.switchedByLabel,
    reason: change.reason,
    fixturesTournamentName: fixtures?.name ?? "",
    awardTournamentName: dumb.name,
    tiers: change.tiers,
    fixturesEnded: fixtures === null || fixtures.status === "closed",
    courts: drain?.courts ?? [],
  };
}

/**
 * If the last match has just come off court, end the retired bracket — in the switch's own words,
 * as the system, and tell the room.
 *
 * Called after a completion, a call-off and a hand-back: the three ways a match stops being in
 * progress. Cheap when there is no switch (two indexed reads) and cheap when the drain is still busy,
 * so no caller has to ask first.
 */
export async function finishDrain(
  db: AppDatabase,
  input: { now: Date },
): Promise<TournamentRow | null> {
  const state = await drainState(db);
  if (state === null || state.liveMatches.length > 0) return null;
  const closed = await db.transaction(async (tx) => {
    const ended = await closeFixtures(tx, {
      tournamentId: state.fixtures.id,
      reason: state.change.reason,
      now: input.now,
    });
    if (!ended) return null;
    // Authored by the desk that confirmed the switch: an announcement names a superadmin, and that
    // person is the act's author. A system id here would mean a new writer for one sentence.
    return createAnnouncement(tx, {
      superadminId: state.change.switchedById,
      authorLabelSnapshot: state.change.switchedByLabel,
      body: messages.modeFixturesEndedAnnouncement,
    });
  });
  if (closed === null) return null;
  // Published after the commit: an event must never say a day ended before it did.
  publishAnnouncement(announcementView(closed));
  return firstOrNull(
    await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, state.fixtures.id)),
  );
}
