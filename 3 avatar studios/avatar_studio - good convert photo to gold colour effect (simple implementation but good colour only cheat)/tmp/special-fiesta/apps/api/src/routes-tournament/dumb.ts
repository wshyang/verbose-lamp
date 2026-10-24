import { and, eq, inArray } from "drizzle-orm";
import type { Hono } from "hono";
import {
  SCAN_UNDO_WINDOW_SECONDS,
  dumbAwardRequestSchema,
  dumbVoidRequestSchema,
  emptyStates,
  messages,
  type DumbAwardView,
  type DumbCourtView,
} from "@psd/contracts";
import { awardPoints, voidAward } from "@psd/tournament/core";
import type { AppDatabase } from "../db/client.js";
import { listTeamMembers } from "../db/entities/index.js";
import { firstOrNull } from "../db/rows.js";
import {
  tournamentAwards,
  tournamentDumbAwards,
  tournamentEntrants,
  tournamentSlots,
  tournaments,
  type TournamentRow,
} from "../db/schema/index.js";
import {
  badRequest,
  conflict,
  notFound,
  readBody,
  requireParam,
} from "../lib/http.js";
import { pushLeaderboard } from "../lib/leaderboardPush.js";
import { requireFacilitator, type AppBindings } from "../lib/session.js";
import { runCommand } from "../tournament/commands.js";
import { dumbDay, liveDumbDay } from "../tournament/dayPolicy.js";
import {
  entrantTeams,
  loadState,
} from "../tournament/load.js";
import {
  inProgressMatches,
  isAwarding,
  readOperatingMode,
} from "../tournament-mode/mode.js";
import { freezeRosters } from "./bridge.js";
import { refusalError } from "./refusals.js";
import {
  withTournamentWrite,
  engineActorOf,
  entrantOfTeam,
  readCourtRows,
  type DayPicture,
} from "./support.js";

/**
 * ADR-321 — dumb courts: the courts as award stations. A court master picks a configured tier and
 * a team; the points land through the ordinary engine award ledger and the points bridge, so the
 * cluster leaderboard cannot tell a dumb award from a desk award. The only dumb-specific storage
 * is `tournament_dumb_award` (court, tier label, double-tap id) — the core stays minimal.
 *
 * There are deliberately no fixtures here: no matches are created, started or scored, and the
 * participant Line-ups tab is answered "no line-ups" by the reads when dumb mode is operating.
 */

/** The undo a court master gets on their own award — the same ten seconds a scan undo gets. */
export const DUMB_UNDO_WINDOW_MS = SCAN_UNDO_WINDOW_SECONDS * 1000;

async function pictureOf(
  db: AppDatabase,
  row: TournamentRow,
): Promise<DayPicture> {
  const courts = await readCourtRows(db);
  return {
    row,
    courts,
    context: {
      state: await loadState(db, row),
      teamOf: await entrantTeams(db, row.id),
      courtLabels: new Map(courts.map((court) => [court.id, court.label])),
      formatId: null,
    },
  };
}

interface AwardRow {
  id: string;
  points: number;
  createdAt: string;
  voidedAt: string | null;
  createdById: string;
  createdByLabel: string;
  tierLabel: string;
  courtId: string;
  teamId: string;
  teamName: string;
}

async function awardRows(
  db: AppDatabase,
  tournamentId: string,
): Promise<AwardRow[]> {
  const rows = await db
    .select({
      id: tournamentAwards.id,
      points: tournamentAwards.points,
      createdAt: tournamentAwards.createdAt,
      voidedAt: tournamentAwards.voidedAt,
      createdById: tournamentAwards.createdById,
      createdByLabel: tournamentAwards.createdByLabel,
      tierLabel: tournamentDumbAwards.tierLabel,
      courtId: tournamentDumbAwards.courtId,
      teamId: tournamentEntrants.teamId,
      teamName: tournamentEntrants.nameSnapshot,
    })
    .from(tournamentAwards)
    .innerJoin(
      tournamentDumbAwards,
      eq(tournamentDumbAwards.awardId, tournamentAwards.id),
    )
    .innerJoin(
      tournamentEntrants,
      eq(tournamentEntrants.id, tournamentAwards.entrantId),
    )
    .where(eq(tournamentAwards.tournamentId, tournamentId));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
  }));
}

function awardView(
  row: AwardRow,
  input: { viewerFacilitatorId: string; now: Date },
): DumbAwardView {
  const withinWindow =
    input.now.getTime() - new Date(row.createdAt).getTime() <=
    DUMB_UNDO_WINDOW_MS;
  return {
    id: row.id,
    teamId: row.teamId,
    teamName: row.teamName,
    tierLabel: row.tierLabel,
    points: row.points,
    awardedAt: row.createdAt,
    awardedByLabel: row.createdByLabel,
    isVoided: row.voidedAt !== null,
    canUndo:
      row.voidedAt === null &&
      row.createdById === input.viewerFacilitatorId &&
      withinWindow,
  };
}

async function courtView(
  db: AppDatabase,
  input: { courtId: string; facilitatorId: string },
): Promise<DumbCourtView> {
  const row = await liveDumbDay(db);
  if (row === null) throw notFound(emptyStates.dumbCourtIdle);
  const court = (await readCourtRows(db)).find(
    (candidate) => candidate.id === input.courtId,
  );
  if (court === undefined) throw notFound(messages.courtNotFound);
  const picture = await pictureOf(db, row);
  const teams = await Promise.all(
    picture.context.state.entrants.map(async (entrant) => {
      const teamId = picture.context.teamOf.get(entrant.id) ?? entrant.id;
      const members = await listTeamMembers(db, teamId).catch(() => []);
      return { teamId, teamName: entrant.name, memberCount: members.length };
    }),
  );
  const now = new Date();
  const awards = (await awardRows(db, row.id))
    .filter((entry) => entry.courtId === input.courtId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((entry) =>
      awardView(entry, { viewerFacilitatorId: input.facilitatorId, now }),
    );
  return {
    courtId: court.id,
    courtLabel: court.label,
    tournamentName: row.name,
    tiers: row.dumbTiers ?? [],
    teams,
    awards,
    undoWindowSeconds: SCAN_UNDO_WINDOW_SECONDS,
  };
}

/**
 * ADR-336 §6.2 — a team still playing is not paid at a station yet.
 *
 * The drain leaves some courts finishing while their neighbours award, and both tournaments hold the
 * same teams. Paying a team that is mid-match would pay it twice for the same minutes and make the
 * Results line unreadable — the court that has just finished, then a court that is still playing.
 * The refusal names the court, because the facilitator's next move is to go and look at it.
 */
async function liveElsewhere(
  db: AppDatabase,
  teamId: string,
): Promise<string | null> {
  const bracket = firstOrNull(
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
  if (bracket === null) return null;
  const live = await inProgressMatches(db, bracket.id);
  if (live.length === 0) return null;
  const entrant = firstOrNull(
    await db
      .select({ id: tournamentEntrants.id })
      .from(tournamentEntrants)
      .where(
        and(
          eq(tournamentEntrants.tournamentId, bracket.id),
          eq(tournamentEntrants.teamId, teamId),
        ),
      )
      .limit(1),
  );
  if (entrant === null) return null;
  const seats = await db
    .select({
      matchId: tournamentSlots.matchId,
      entrantId: tournamentSlots.seatedEntrantId,
    })
    .from(tournamentSlots)
    .where(
      inArray(
        tournamentSlots.matchId,
        live.map((match) => match.id),
      ),
    );
  const seat = seats.find((row) => row.entrantId === entrant.id);
  if (seat === undefined) return null;
  const courtId =
    live.find((match) => match.id === seat.matchId)?.courtId ?? null;
  const court = (await readCourtRows(db)).find(
    (candidate) => candidate.id === courtId,
  );
  // A court with no label is still a court: the sentence has to name somewhere to go and look.
  return court?.label ?? "another court";
}

/** The Results feed in dumb mode: every dumb award of the day, newest first. */
export async function dumbFeedEntries(
  db: AppDatabase,
): Promise<
  {
    id: string;
    teamName: string;
    tierLabel: string;
    points: number;
    awardedAt: string;
    isVoided: boolean;
  }[]
> {
  const row = await dumbDay(db);
  if (row === null) return [];
  return (await awardRows(db, row.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((entry) => ({
      id: entry.id,
      teamName: entry.teamName,
      tierLabel: entry.tierLabel,
      points: entry.points,
      awardedAt: entry.createdAt,
      isVoided: entry.voidedAt !== null,
    }));
}

function registerDumbReads(routes: Hono<AppBindings>): void {
  // Whether the courts are running dumb today — the station picker routes courts here when so.
  // ADR-336 — the answer is the day's mode, not "is a dumb tournament live": during the drain a
  // court that has finished its match must already be awarding while its neighbour still plays.
  routes.get("/dumb/status", async (c) => {
    requireFacilitator(c);
    return c.json({ active: isAwarding(await readOperatingMode(c.get("db"))) });
  });

  routes.get("/dumb/courts/:courtId", async (c) => {
    const actor = requireFacilitator(c);
    return c.json(
      await courtView(c.get("db"), {
        courtId: requireParam(c, "courtId"),
        facilitatorId: actor.facilitator.id,
      }),
    );
  });
}

function registerDumbAward(routes: Hono<AppBindings>): void {
  routes.post("/dumb/courts/:courtId/awards", async (c) => {
    const session = requireFacilitator(c);
    const actor = engineActorOf(session);
    const courtId = requireParam(c, "courtId");
    const body = await readBody(c, dumbAwardRequestSchema);
    const db = c.get("db");
    // A retried tap (same client id) replays the award it already made — never a second payment.
    const replay = firstOrNull(
      await db
        .select()
        .from(tournamentDumbAwards)
        .where(eq(tournamentDumbAwards.clientUuid, body.clientAwardUuid)),
    );
    if (replay !== null)
      return c.json(
        await courtView(db, { courtId, facilitatorId: session.facilitator.id }),
      );
    const row = await liveDumbDay(db);
    if (row === null) throw notFound(emptyStates.dumbCourtIdle);
    const tier = (row.dumbTiers ?? []).find(
      (candidate) =>
        candidate.label.toLowerCase() === body.tierLabel.toLowerCase(),
    );
    if (tier === undefined)
      throw badRequest(
        "That tier is not part of this tournament.",
        "tierLabel",
      );
    const playing = await liveElsewhere(db, body.teamId);
    if (playing !== null) {
      throw conflict(
        `That team is still playing on ${playing}. Finish or call off that match first.`,
      );
    }
    const picture = await pictureOf(db, row);
    const entrantId = entrantOfTeam(picture.context, body.teamId);
    if (entrantId === null) throw notFound(messages.teamNotFound);
    // ADR-346 — the award and its follow-through are one expression: a court master's tap
    // cannot commit without the caches voiding and the day re-planning around it.
    await withTournamentWrite(db, { now: new Date(), isResult: true }, async () => {
      const outcome = await runCommand(db, {
        actor,
        now: new Date(),
        kind: "dumb_courts",
        command: (state, context) =>
          awardPoints(
            state,
            {
              entrantId,
              points: tier.points,
              reason: `${tier.label} · ${picture.row.name}`,
            },
            context,
          ),
        afterPersist: async (tx, written) => {
          await freezeRosters(tx, written);
          for (const award of written.newAwards) {
            await tx
              .insert(tournamentDumbAwards)
              .values({
                awardId: award.id,
                courtId,
                tierLabel: tier.label,
                clientUuid: body.clientAwardUuid,
              });
          }
        },
      });
      if (!outcome.ok) throw refusalError(outcome.refusal);
    });
    await pushLeaderboard(db);
    return c.json(
      await courtView(db, { courtId, facilitatorId: session.facilitator.id }),
      201,
    );
  });
}

function registerDumbVoid(routes: Hono<AppBindings>): void {
  routes.post("/dumb/awards/:awardId/void", async (c) => {
    const session = requireFacilitator(c);
    const actor = engineActorOf(session);
    const awardId = requireParam(c, "awardId");
    const body = await readBody(c, dumbVoidRequestSchema);
    const db = c.get("db");
    const meta = firstOrNull(
      await db
        .select()
        .from(tournamentDumbAwards)
        .where(eq(tournamentDumbAwards.awardId, awardId)),
    );
    if (meta === null) throw notFound("No such award.");
    const row = await liveDumbDay(db);
    if (row === null) throw notFound(emptyStates.dumbCourtIdle);
    const award = (await awardRows(db, row.id)).find(
      (candidate) => candidate.id === awardId,
    );
    if (award === undefined) throw notFound("No such award.");
    if (award.createdById !== session.facilitator.id)
      throw badRequest(
        "Only the court master who awarded these points can take them back here.",
      );
    if (
      Date.now() - new Date(award.createdAt).getTime() >
      DUMB_UNDO_WINDOW_MS
    ) {
      throw badRequest(messages.swagUndoExpired);
    }
    // ADR-346 — the take-back and its follow-through are one expression, like the award.
    await withTournamentWrite(db, { now: new Date(), isResult: true }, async () => {
      const outcome = await runCommand(db, {
        actor,
        now: new Date(),
        kind: "dumb_courts",
        command: (state, context) =>
          voidAward(
            state,
            { awardId, reason: body.reason ?? "Taken back at the court." },
            context,
          ),
        afterPersist: freezeRosters,
      });
      if (!outcome.ok) throw refusalError(outcome.refusal);
    });
    await pushLeaderboard(db);
    return c.json(
      await courtView(db, {
        courtId: meta.courtId,
        facilitatorId: session.facilitator.id,
      }),
    );
  });
}

export function registerDumbCourts(routes: Hono<AppBindings>): void {
  registerDumbReads(routes);
  registerDumbAward(routes);
  registerDumbVoid(routes);
}
