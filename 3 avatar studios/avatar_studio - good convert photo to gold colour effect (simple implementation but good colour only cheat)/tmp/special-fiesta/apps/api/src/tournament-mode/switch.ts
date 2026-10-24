import { and, eq, inArray, isNull } from "drizzle-orm";
import { messages, type AwardTier } from "@psd/contracts";
import {
  closeTournament,
  pauseTournament,
  type Actor,
} from "@psd/tournament/core";
import { newId } from "../db/ids.js";
import type { AppDatabase, AppTransaction } from "../db/client.js";
import { firstOrNull } from "../db/rows.js";
import {
  tournamentEntrants,
  tournaments,
  tournamentModeChanges,
  type TournamentRow,
} from "../db/schema/index.js";
import { createAnnouncement } from "../db/entities/index.js";
import type { AnnouncementRow } from "../db/schema/index.js";
import { runCommandIn } from "../tournament/commands.js";
import { loadState } from "../tournament/load.js";
import { createDraftIn } from "../tournament/setup.js";
import { activateDumbIn } from "../tournament-scheduler/scheduler.js";
import { inProgressMatches } from "./mode.js";
import { confirmRequestIn } from "./requests.js";
import { tiersForSwitch } from "./tiers.js";

/**
 * ADR-336 §5 — the one-way switch to court awards, in one transaction.
 *
 * The act a room makes mid-day and cannot take back: a bracket day stops taking matches, an award day
 * starts over the same teams, and the decision is written down with the person who confirmed it. Four
 * writes plus an announcement, and every one of them is in the same commit — a runner that opened its
 * own transaction would leave a paused bracket and no award day if the third write failed, which is
 * the one state this design exists to make impossible.
 *
 * The three things this function refuses are the three ways the act can be wrong:
 *  - the wrong word typed (the guard against a slip mid-shout), and a reason, because it is what the
 *    room is later told;
 *  - no live fixture day to switch (a draft is not playable, and the desk's own dry run is a pause);
 *  - an award day already running — the switch happens once, and its `clientUuid` is what makes a
 *    double tap a replay rather than a second day.
 */

export interface SwitchInput {
  actor: Actor;
  reason: string;
  confirmation: string;
  clientUuid: string;
  /** What the desk edited in the confirm dialog; omitted accepts the derivation (§4). */
  tiers?: readonly AwardTier[] | undefined;
  /** ADR-336 §5.4 — the ask this switch answers, resolved as confirmed in the same transaction. */
  requestId?: string | undefined;
  now: Date;
}

export type SwitchOutcome =
  | {
      ok: true;
      dumbTournamentId: string;
      fixturesTournamentId: string;
      replayed: boolean;
      /** The row to publish once the transaction commits; null on a replay, which says nothing new. */
      announcement: AnnouncementRow | null;
    }
  | { ok: false; error: string; status: 400 | 409 };

/** The word, compared the way a person under pressure would expect: case-insensitively, trimmed. */
export const SWITCH_WORD = "switch";

/**
 * The system who ends the bracket: not a person, but the switch the desk confirmed. Its own actor
 * rather than the scheduler's, because the history line should say which of the two ended the day.
 */
export const SWITCH_ACTOR: Actor = {
  kind: "system",
  id: "fac20000-0000-4000-8000-000000000001",
  label: "the switch",
};

function refusal(status: 400 | 409, error: string): SwitchOutcome {
  return { ok: false, error, status };
}

/**
 * The award day's own name. The room sees one day with two halves, so the award day is named after
 * the day it replaced rather than invented — a second name on a Results header would read as a
 * second tournament, which is exactly what a participant must not conclude.
 */
function awardDayName(fixtures: TournamentRow): string {
  const name = `${fixtures.name} — points`.trim();
  return name.length <= 60 ? name : `${name.slice(0, 59)}…`;
}

/** The live fixture day, if there is one to switch. A draft is not playable. */
async function liveFixtures(
  db: AppDatabase | AppTransaction,
): Promise<TournamentRow | null> {
  return firstOrNull(
    await db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.kind, "captains_ball"),
          eq(tournaments.status, "live"),
        ),
      )
      .limit(1),
  );
}

async function replayOf(
  db: AppTransaction | AppDatabase,
  clientUuid: string,
): Promise<SwitchOutcome | null> {
  const row = firstOrNull(
    await db
      .select()
      .from(tournamentModeChanges)
      .where(eq(tournamentModeChanges.clientUuid, clientUuid)),
  );
  if (row === null) return null;
  // The retry of a switch that already happened: acknowledge the first one and write nothing.
  return {
    ok: true,
    dumbTournamentId: row.dumbTournamentId,
    fixturesTournamentId: row.fixturesTournamentId,
    replayed: true,
    announcement: null,
  };
}

/**
 * The switch itself. The caller publishes the announcement and pushes the board once this returns:
 * an event must never go out ahead of the commit that made it true.
 */
export async function switchToAwards(
  db: AppDatabase,
  input: SwitchInput,
): Promise<SwitchOutcome> {
  const replayed = await replayOf(db, input.clientUuid);
  if (replayed !== null) return replayed;
  if (input.confirmation.trim().toLowerCase() !== SWITCH_WORD)
    return refusal(400, messages.modeSwitchNeedsWord);
  const fixtures = await liveFixtures(db);
  if (fixtures === null) return refusal(409, messages.modeSwitchNoFixtures);

  const outcome = await db.transaction(async (tx): Promise<SwitchOutcome> => {
    // The replay check again, inside the transaction: two taps a millisecond apart both reach here,
    // and only one of them may create a day. The unique index is the backstop behind this read.
    const again = await replayOf(tx, input.clientUuid);
    if (again !== null) return again;

    const existingDumb = firstOrNull(
      await tx
        .select()
        .from(tournaments)
        .where(
          and(
            eq(tournaments.kind, "dumb_courts"),
            inArray(tournaments.status, ["draft", "live"]),
          ),
        )
        .limit(1),
    );
    if (existingDumb !== null)
      return refusal(409, messages.modeSwitchAlreadyAwarding);

    // §5.2 — the bracket stops taking matches. Everything on court keeps scoring, which is what
    // makes a mid-day switch survivable at all.
    const paused = await runCommandIn(tx, {
      kind: "captains_ball",
      actor: input.actor,
      now: input.now,
      command: (state, context) =>
        pauseTournament(state, { reason: input.reason }, context),
    });
    if (!paused.ok) return refusal(409, paused.refusal.message);

    // §4 — the buttons are the day's own paid rates, unless the desk corrected them.
    const state = await loadState(tx, fixtures);
    const tiers = tiersForSwitch(state, input.tiers);

    // The same teams, in the order they entered, minus anyone who has withdrawn. The core's entrant
    // ids are this tournament's own; the dumb day is a new tournament, so it gets the app's team ids.
    const entrants = (
      await tx
        .select({
          teamId: tournamentEntrants.teamId,
          name: tournamentEntrants.nameSnapshot,
        })
        .from(tournamentEntrants)
        .where(
          and(
            eq(tournamentEntrants.tournamentId, fixtures.id),
            isNull(tournamentEntrants.withdrawnAt),
          ),
        )
        .orderBy(tournamentEntrants.entryOrder)
    ).map((row) => ({ teamId: row.teamId, name: row.name }));
    const created = await createDraftIn(tx, {
      name: awardDayName(fixtures),
      kind: "dumb_courts",
      rates: state.tournament.rates,
      entrants,
      tiers,
      setup: null,
      createdBy: input.actor,
    });
    if (!created.ok) return refusal(409, messages.modeSwitchAlreadyAwarding);
    const activated = await activateDumbIn(tx, {
      tournamentId: created.tournamentId,
      now: input.now,
    });
    if (!activated.ok) return refusal(400, activated.error);

    await tx.insert(tournamentModeChanges).values({
      id: newId(),
      fixturesTournamentId: fixtures.id,
      dumbTournamentId: created.tournamentId,
      tiers: [...tiers],
      reason: input.reason,
      switchedById: input.actor.id,
      switchedByLabel: input.actor.label,
      switchedAt: input.now,
      clientUuid: input.clientUuid,
    });

    // §5.4 — the ask this answers is resolved inside the same commit: a switch that failed leaves it
    // pending (the caller rolls back), and an expired one is refused before anything is written.
    if (input.requestId !== undefined) {
      const answered = await confirmRequestIn(tx, {
        id: input.requestId,
        resolvedByLabel: input.actor.label,
        now: input.now,
      });
      if (!answered.ok) return refusal(answered.status, answered.error);
    }

    // §5.5 — the room is told in the same breath as it is true. Authored by the desk that confirmed:
    // an announcement has to name a superadmin, and that person is the act's author.
    const announcement = await createAnnouncement(tx, {
      superadminId: input.actor.id,
      authorLabelSnapshot: input.actor.label,
      body: messages.modeSwitchedAnnouncement,
    });

    // §5.6 / §6.4 — with nothing on court there is nothing to drain: the bracket ends inside this
    // transaction, as the system, in the switch's own words. Nothing is left paused.
    if ((await inProgressMatches(tx, fixtures.id)).length === 0) {
      await closeFixtures(tx, {
        tournamentId: fixtures.id,
        reason: input.reason,
        now: input.now,
      });
    }
    return {
      ok: true,
      dumbTournamentId: created.tournamentId,
      fixturesTournamentId: fixtures.id,
      replayed: false,
      announcement,
    };
  });
  return outcome;
}

/**
 * §6.4 — the bracket ends itself. A system act: the desk confirmed a switch, not a close, and asking
 * a person to click a second button for the fixtures they just retired is a button pressed wrong at
 * the one moment nobody is looking at it.
 */
export async function closeFixtures(
  tx: AppTransaction,
  input: { tournamentId: string; reason: string; now: Date },
): Promise<boolean> {
  const outcome = await runCommandIn(tx, {
    kind: "captains_ball",
    actor: SWITCH_ACTOR,
    now: input.now,
    command: (state, context) =>
      closeTournament(state, { reason: input.reason }, context),
  });
  return outcome.ok;
}
