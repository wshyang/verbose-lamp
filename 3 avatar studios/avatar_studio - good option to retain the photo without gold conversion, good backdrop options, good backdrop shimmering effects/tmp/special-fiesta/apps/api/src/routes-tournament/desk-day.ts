import type { Hono } from "hono";
import {
  closeTournamentRequestSchema,
  completeStageRequestSchema,
  contingencyRequestSchema,
  messages,
  moveMatchRequestSchema,
  pauseTournamentRequestSchema,
  restageStageRequestSchema,
  switchTournamentRequestSchema,
  declineSwitchRequestSchema,
  terminateSchedulerRequestSchema,
  tournamentAwardRequestSchema,
  voidRequestSchema,
  withdrawTeamRequestSchema,
} from "@psd/contracts";
import {
  awardPoints,
  closeTournament,
  completeStage,
  pauseTournament,
  voidAward,
  withdrawEntrant,
} from "@psd/tournament/core";
import {
  HttpError,
  badRequest,
  notFound,
  readBody,
  requireParam,
} from "../lib/http.js";
import { pushLeaderboard } from "../lib/leaderboardPush.js";
import {
  requireSuperadmin,
  type AppBindings,
  type AppContext,
} from "../lib/session.js";
import type { EngineCommand } from "../tournament/commands.js";
import { dumbDay, openDayExists } from "../tournament/dayPolicy.js";
import { entrantTeams } from "../tournament/load.js";
import { runBridged } from "./bridge.js";
import {
  applyContingency,
  moveMatch,
  previewContingency,
  releasePin,
  terminate,
} from "../tournament-scheduler/control.js";
import { restageStage } from "../tournament-scheduler/restage.js";
import { switchToAwards } from "../tournament-mode/switch.js";
import { declineRequest } from "../tournament-mode/requests.js";
import { publishAnnouncement } from "../lib/statusBus.js";
import { announcementView } from "../views/announcements.js";
import {
  contingencyView,
  readConsole,
  readEventLog,
  readTimetable,
} from "./desk.js";
import { refusalError } from "./refusals.js";
import {
  withTournamentWrite,
  engineActorOf,
  entrantOfTeam,
  readDay,
} from "./support.js";

/**
 * ADR-279 — the desk's hand on the day: requirement 5 (close a stage, with overrides), requirement 6
 * (award active-day points to a team, and void them), requirement 8 (contingency, previewed before it
 * is applied), requirement 9 (move a match; stop the scheduler for good), withdraw a team, close the
 * day — and the Control, Timetable and history reads.
 */

// ADR-346 — the write and its follow-through are one expression: the route cannot return
// between committing an engine act and voiding the caches / re-planning the day.
async function run(c: AppContext, command: EngineCommand, follow: { isResult: boolean }) {
  const actor = engineActorOf(requireSuperadmin(c));
  return withTournamentWrite(c.get("db"), { now: new Date(), isResult: follow.isResult }, async () => {
    const outcome = await runBridged(c.get("db"), {
      actor,
      now: new Date(),
      command,
    });
    if (!outcome.ok) throw refusalError(outcome.refusal);
    return outcome;
  });
}

// ADR-346 — the follow-through moved into the writes (withTournamentWrite); the answer is now
// just the console as it stands after them.
async function answer(c: AppContext) {
  const now = new Date();
  return c.json(await readConsole(c.get("db"), now));
}

async function teamEntrant(c: AppContext, teamId: string): Promise<string> {
  const day = await readDay(c.get("db"));
  const entrantId = day === null ? null : entrantOfTeam(day.context, teamId);
  if (entrantId === null) throw notFound(messages.teamNotInTournament);
  return entrantId;
}

type AwardKind = "captains_ball" | "dumb_courts";

/** ADR-321 — a team's entrant in one kind's open tournament, or null when it is not playing there. */
async function entrantInKind(
  c: AppContext,
  kind: AwardKind,
  teamId: string,
): Promise<string | null> {
  const db = c.get("db");
  if (kind === "captains_ball") {
    const day = await readDay(db);
    return day === null ? null : entrantOfTeam(day.context, teamId);
  }
  const row = await dumbDay(db);
  if (row === null || row.status !== "live") return null;
  const teamOf = await entrantTeams(db, row.id);
  for (const [entrantId, mapped] of teamOf)
    if (mapped === teamId) return entrantId;
  return null;
}

async function runInKind(
  c: AppContext,
  kind: AwardKind,
  command: EngineCommand,
) {
  const actor = engineActorOf(requireSuperadmin(c));
  return runBridged(c.get("db"), { actor, now: new Date(), command, kind });
}

function registerReads(routes: Hono<AppBindings>): void {
  routes.get("/", async (c) => {
    requireSuperadmin(c);
    return c.json(await readConsole(c.get("db"), new Date()));
  });

  routes.get("/timetable", async (c) => {
    requireSuperadmin(c);
    return c.json(await readTimetable(c.get("db"), new Date()));
  });

  routes.get("/events", async (c) => {
    requireSuperadmin(c);
    return c.json({ items: await readEventLog(c.get("db")) });
  });
}

function registerStages(routes: Hono<AppBindings>): void {
  // Requirement 5 — the stage closes as a person's decision; the table seats who goes on, unless overruled.
  routes.post("/stages/:stageId/complete", async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, completeStageRequestSchema);
    const stageId = requireParam(c, "stageId");
    const overrides = await Promise.all(
      body.overrides.map(async (row) =>
        "place" in row
          ? { place: row.place, entrantId: await teamEntrant(c, row.teamId) }
          : {
              matchId: row.matchId,
              side: row.side,
              entrantId: await teamEntrant(c, row.teamId),
            },
      ),
    );
    await run(
      c,
      (state, context) =>
        completeStage(
          state,
          { stageId, overrides, reason: body.reason },
          context,
        ),
      { isResult: false },
    );
    return answer(c);
  });

  // ADR-334 (F12) — rebuild an unstarted stage: the scheduler re-plans it, the core swaps it in.
  routes.post("/stages/:stageId/restructure", async (c) => {
    const actor = engineActorOf(requireSuperadmin(c));
    const body = await readBody(c, restageStageRequestSchema);
    const day = await readDay(c.get("db"));
    if (day === null) throw notFound(messages.tournamentNotActive);
    await withTournamentWrite(c.get("db"), { now: new Date(), isResult: false }, async () => {
      const outcome = await restageStage(c.get("db"), {
        tournamentId: day.context.state.tournament.id,
        stageId: requireParam(c, "stageId"),
        patch: { ...body },
        actor,
      });
      if (!outcome.ok) {
        if ("refusal" in outcome) throw refusalError(outcome.refusal);
        throw badRequest(outcome.error);
      }
    });
    return answer(c);
  });

  routes.post("/entrants/:teamId/withdraw", async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, withdrawTeamRequestSchema);
    const entrantId = await teamEntrant(c, requireParam(c, "teamId"));
    await run(
      c,
      (state, context) =>
        withdrawEntrant(state, { entrantId, reason: body.reason }, context),
      { isResult: false },
    );
    return answer(c);
  });
}

function registerAwards(routes: Hono<AppBindings>): void {
  // Requirement 6 — active-day points to a team; who on it is paid is the points bridge's business (ADR-276).
  routes.post("/awards", async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, tournamentAwardRequestSchema);
    // ADR-321 — the desk awards against whichever tournament is operating: captain's ball, or dumb courts.
    const captainsEntrant = await entrantInKind(
      c,
      "captains_ball",
      body.teamId,
    );
    const kind: AwardKind =
      captainsEntrant !== null ? "captains_ball" : "dumb_courts";
    const entrantId =
      captainsEntrant ?? (await entrantInKind(c, "dumb_courts", body.teamId));
    if (entrantId === null) throw notFound(messages.teamNotInTournament);
    await withTournamentWrite(c.get("db"), { now: new Date(), isResult: true }, async () => {
      const outcome = await runInKind(c, kind, (state, context) =>
        awardPoints(
          state,
          { entrantId, points: body.points, reason: body.reason },
          context,
        ),
      );
      if (!outcome.ok) throw refusalError(outcome.refusal);
    });
    const response = await answer(c);
    await pushLeaderboard(c.get("db"));
    return response;
  });

  routes.post("/awards/:awardId/void", async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, voidRequestSchema);
    const awardId = requireParam(c, "awardId");
    // ADR-321 — a dumb award past the court master's undo window is voided here, like any manual award.
    const command: EngineCommand = (state, context) =>
      voidAward(state, { awardId, reason: body.reason }, context);
    // ADR-346 — both attempts share one follow-through: the kind the award lives in is
    // discovered by trying, and a refused first attempt must not re-plan the day for nothing.
    await withTournamentWrite(c.get("db"), { now: new Date(), isResult: true }, async () => {
      const first = await runInKind(c, "captains_ball", command);
      const outcome = first.ok
        ? first
        : await runInKind(c, "dumb_courts", command);
      if (!outcome.ok) throw refusalError(outcome.refusal);
    });
    const response = await answer(c);
    await pushLeaderboard(c.get("db"));
    return response;
  });
}

function registerContingency(routes: Hono<AppBindings>): void {
  // Requirement 8 — what a change would move, said before it is made (P-14). Writes nothing.
  routes.post("/contingency/preview", async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, contingencyRequestSchema);
    const deadlineAt =
      body.deadlineAt === undefined
        ? undefined
        : body.deadlineAt === null
          ? null
          : new Date(body.deadlineAt);
    const preview = await previewContingency(c.get("db"), {
      ...body,
      deadlineAt,
      now: new Date(),
    });
    if (!preview.ok) throw badRequest(preview.error);
    return c.json(await contingencyView(c.get("db"), preview));
  });

  routes.post("/contingency/apply", async (c) => {
    const actor = engineActorOf(requireSuperadmin(c));
    const body = await readBody(c, contingencyRequestSchema);
    const deadlineAt =
      body.deadlineAt === undefined
        ? undefined
        : body.deadlineAt === null
          ? null
          : new Date(body.deadlineAt);
    await withTournamentWrite(c.get("db"), { now: new Date(), isResult: false }, async () => {
      const applied = await applyContingency(c.get("db"), {
        ...body,
        deadlineAt,
        actor,
        now: new Date(),
      });
      if (!applied.ok) throw badRequest(applied.error);
    });
    return answer(c);
  });
}

function registerControl(routes: Hono<AppBindings>): void {
  // Requirement 9 — a person puts a match on a court at a time; the planner keeps it there while it runs.
  routes.post("/matches/:matchId/move", async (c) => {
    const actor = engineActorOf(requireSuperadmin(c));
    const body = await readBody(c, moveMatchRequestSchema);
    const input = {
      actor,
      matchId: requireParam(c, "matchId"),
      courtId: body.courtId,
      start: new Date(body.startAt),
      now: new Date(),
    };
    await withTournamentWrite(c.get("db"), { now: new Date(), isResult: false }, async () => {
      const outcome = await moveMatch(c.get("db"), input);
      if (!outcome.ok) throw refusalError(outcome.refusal);
    });
    return answer(c);
  });

  routes.post("/matches/:matchId/release", async (c) => {
    requireSuperadmin(c);
    await withTournamentWrite(c.get("db"), { now: new Date(), isResult: false }, async () => {
      const isReleased = await releasePin(c.get("db"), {
        matchId: requireParam(c, "matchId"),
        now: new Date(),
      });
      if (!isReleased) throw notFound(messages.matchNotFound);
    });
    return answer(c);
  });

  // Requirement 9 — the scheduler stops for good; from here every scheduling act is a person's.
  routes.post("/scheduler/terminate", async (c) => {
    const actor = requireSuperadmin(c);
    const body = await readBody(c, terminateSchedulerRequestSchema);
    await withTournamentWrite(c.get("db"), { now: new Date(), isResult: false }, async () => {
      const stopped = await terminate(c.get("db"), {
        reason: body.reason,
        label: actor.superadmin.username,
        now: new Date(),
      });
      if (!stopped.ok) throw badRequest(stopped.error);
    });
    return answer(c);
  });

  // ADR-336 — stop the day taking new matches. The only thing this route changes is that no match
  // may go on court from here: everything live finishes under its own marshal, and the day is
  // closed by the switch (or by hand) rather than resumed.
  routes.post("/pause", async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, pauseTournamentRequestSchema);
    await withTournamentWrite(c.get("db"), { now: new Date(), isResult: false }, async () => {
      const outcome = await runInKind(c, "captains_ball", (state, context) =>
        pauseTournament(state, { reason: body.reason }, context),
      );
      if (!outcome.ok) throw refusalError(outcome.refusal);
    });
    return answer(c);
  });

  /**
   * ADR-336 §5 — the one-way switch to court awards.
   *
   * Superadmin only, and deliberately not behind a confirmation flag on the client: the typed word is
   * validated here, and the reason is required because it is the sentence the room is later told. The
   * whole act — pause, award day, mode log, announcement, and the bracket's own end when nothing is
   * on court — is one transaction in `tournament-mode/switch.ts`; this route only refuses badly and
   * then publishes what the commit made true.
   */
  routes.post("/switch", async (c) => {
    const session = requireSuperadmin(c);
    const actor = engineActorOf(session);
    const body = await readBody(c, switchTournamentRequestSchema);
    const now = new Date();
    await withTournamentWrite(c.get("db"), { now, isResult: true }, async () => {
      const outcome = await switchToAwards(c.get("db"), {
        actor,
        now,
        reason: body.reason,
        confirmation: body.confirmation,
        clientUuid: body.clientUuid,
        tiers: body.tiers,
        requestId: body.requestId,
      });
      if (!outcome.ok) throw new HttpError(outcome.status, outcome.error);
      if (outcome.announcement !== null)
        publishAnnouncement(announcementView(outcome.announcement));
    });
    await pushLeaderboard(c.get("db"));
    return c.json(await readConsole(c.get("db"), now));
  });

  /**
   * ADR-336 §5.4 — the desk says no to a facilitator's ask, with a reason. The ask stays on the record
   * as declined, and the banner clears so the next marshal's question is the one on screen.
   */
  routes.post("/mode/requests/:requestId/decline", async (c) => {
    const actor = requireSuperadmin(c);
    const body = await readBody(c, declineSwitchRequestSchema);
    await withTournamentWrite(c.get("db"), { now: new Date(), isResult: false }, async () => {
      const outcome = await declineRequest(c.get("db"), {
        id: requireParam(c, "requestId"),
        reason: body.reason,
        resolvedByLabel: actor.superadmin.username,
      });
      if (!outcome.ok) throw new HttpError(outcome.status, outcome.error);
    });
    return answer(c);
  });

  // P-15 — the day ends as an act: never over a live match, and with a reason if it ends early.
  // ADR-326 — the desk closes the tournament it is looking at: the console resolves captain's
  // ball first and dumb courts otherwise (ADR-321), so the close must resolve the same way —
  // a dumb-only day previously had a Close button that closed nothing (it 404'd on the
  // captain's-ball slot). Found by the size-loop suite, which closes both kinds at every size.
  // ADR-345 — `openDayExists` is that preference as a named policy, stated beside `deskDay`
  // in tournament/dayPolicy.ts and asserted against it in the matrix test.
  routes.post("/close", async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, closeTournamentRequestSchema);
    const kind: AwardKind =
      await openDayExists(c.get("db")) ? "captains_ball" : "dumb_courts";
    await withTournamentWrite(c.get("db"), { now: new Date(), isResult: true }, async () => {
      const outcome = await runInKind(c, kind, (state, context) =>
        closeTournament(state, { reason: body.reason }, context),
      );
      if (!outcome.ok) throw refusalError(outcome.refusal);
    });
    return answer(c);
  });
}

export function registerDeskDay(routes: Hono<AppBindings>): void {
  registerReads(routes);
  registerStages(routes);
  registerAwards(routes);
  registerContingency(routes);
  registerControl(routes);
}
