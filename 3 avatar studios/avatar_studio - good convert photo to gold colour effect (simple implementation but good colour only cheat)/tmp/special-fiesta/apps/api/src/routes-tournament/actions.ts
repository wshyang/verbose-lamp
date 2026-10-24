import type { Hono } from "hono";
import {
  completeMatchRequestSchema,
  messages,
  setMatchScoreRequestSchema,
  startMatchRequestSchema,
} from "@psd/contracts";
import type { MatchView } from "@psd/contracts";
import {
  callOff,
  completeMatch,
  scoreStep,
  startPair,
  type Match,
  type Side,
} from "@psd/tournament/core";
import type { AppDatabase } from "../db/client.js";
import { required } from "../db/rows.js";
import { badRequest, notFound, readBody, requireParam } from "../lib/http.js";
import { pushLeaderboard } from "../lib/leaderboardPush.js";
import { assertResultMatchesScore } from "../lib/matchResult.js";
import {
  requireFacilitator,
  type AppBindings,
  type AppContext,
} from "../lib/session.js";
import { publishFeedMatch } from "../lib/statusBus.js";
import type { CommandOutcome, EngineCommand } from "../tournament/commands.js";
import { runBridged } from "./bridge.js";
import { findScheduler } from "../tournament-scheduler/scheduler.js";
import { matchStageOf, matchView } from "../views/tournament.js";
import { refusalError } from "./refusals.js";
import {
  afterScore,
  engineActorOf,
  entrantOfTeam,
  readDay,
  withTournamentWrite,
  type DayPicture,
} from "./support.js";

/**
 * ADR-277 — F22–F24 and the live score, at the old paths. Each handler runs one engine command as
 * the signed-in facilitator, does what the write means for the app, and pushes the match it changed
 * (ADR-131: the frame IS the response body, so the two cannot disagree).
 */

/** What a match staged by hand is planned for when there is no scheduler to name a length. */
const AD_HOC_MINUTES = 12;

type Done = Extract<CommandOutcome, { ok: true }>;

async function liveDay(db: AppDatabase): Promise<DayPicture | null> {
  const day = await readDay(db);
  return day !== null && day.row.status === "live" ? day : null;
}

async function run(c: AppContext, command: EngineCommand): Promise<Done> {
  const actor = engineActorOf(requireFacilitator(c));
  const outcome = await runBridged(c.get("db"), {
    actor,
    now: new Date(),
    command,
  });
  if (!outcome.ok) throw refusalError(outcome.refusal);
  return outcome;
}

/**
 * The match as it stands after the write (and any re-plan), in the feed's shape.
 *
 * ADR-336 §6.4 — deliberately `readDay` and not `liveDay`: the write being answered may have taken
 * the last match off court mid-switch, and the drain closes the bracket inside `afterWrite`. The
 * completion still happened, so its answer must not become a 404 because the day ended on the way
 * back — the closed day is what the room is now looking at.
 */
async function viewOf(db: AppDatabase, matchId: string): Promise<MatchView> {
  const day = await readDay(db);
  const match = day?.context.state.matches.find((row) => row.id === matchId);
  if (day === null || match === undefined)
    throw notFound(messages.matchNotFound);
  return matchView(day.context, match);
}

async function liveMatch(
  c: AppContext,
  matchId: string,
): Promise<{ day: DayPicture; match: Match }> {
  const day = await liveDay(c.get("db"));
  const match = day?.context.state.matches.find((row) => row.id === matchId);
  if (day === null || match === undefined)
    throw notFound(messages.matchNotFound);
  if (match.status !== "in_progress")
    throw badRequest(messages.invalidStatusTransition);
  return { day, match };
}

function registerStart(routes: Hono<AppBindings>): void {
  // F22 — the queued match for this pair is claimed; any other pair is staged ad hoc (ADR-277).
  routes.post("/matches", async (c) => {
    requireFacilitator(c);
    const body = await readBody(c, startMatchRequestSchema);
    if (body.teamAId === body.teamBId)
      throw badRequest(messages.teamCannotPlayItself);
    // §4.2.7 — the tournament carries its own rates, so "configured" is "a tournament is live".
    const day = await liveDay(c.get("db"));
    if (day === null) throw badRequest(messages.tournamentNotConfigured);
    const entrantAId = entrantOfTeam(day.context, body.teamAId);
    const entrantBId = entrantOfTeam(day.context, body.teamBId);
    if (entrantAId === null || entrantBId === null)
      throw notFound(messages.teamNotFound);
    const plannedMinutes =
      (await findScheduler(c.get("db"), day.row.id))?.matchMinutes ??
      AD_HOC_MINUTES;
    const pair = {
      courtId: body.courtId,
      entrantAId,
      entrantBId,
      plannedMinutes,
    };
    // ADR-346 — the write and its follow-through are one expression; the invariant read that
    // extracts the started match stays inside it, so a broken write follows through never.
    const started = await withTournamentWrite(
      c.get("db"),
      { now: new Date(), isResult: false },
      async () => {
        const outcome = await run(c, (state, context) =>
          startPair(state, pair, context),
        );
        // An accepted start puts exactly one match on the court, claimed or staged.
        return required(outcome.written.startedMatches[0], "started match");
      },
    );
    const view = await viewOf(c.get("db"), started.id);
    publishFeedMatch(view);
    return c.json({ match: view }, 201);
  });
}

function registerScore(routes: Hono<AppBindings>): void {
  // ADR-114 — one side, one point, one request; the step and the compare-and-set are the engine's.
  routes.post("/matches/:matchId/score", async (c) => {
    requireFacilitator(c);
    const body = await readBody(c, setMatchScoreRequestSchema);
    const matchId = requireParam(c, "matchId");
    await run(c, (state, context) =>
      scoreStep(
        state,
        { matchId, side: body.side, from: body.from, to: body.to },
        context,
      ),
    );
    // A point moves no plan and pays nobody: the live picture is void, nothing more (ADR-120).
    afterScore();
    const view = await viewOf(c.get("db"), matchId);
    publishFeedMatch(view);
    return c.json({ match: view });
  });
}

function sideOfTeam(
  day: DayPicture,
  input: { match: Match; teamId: string | null },
): Side | null {
  if (input.teamId === null) return null;
  const entrantId = entrantOfTeam(day.context, input.teamId);
  if (entrantId !== null && input.match.slots.a.seatedEntrantId === entrantId)
    return "a";
  if (entrantId !== null && input.match.slots.b.seatedEntrantId === entrantId)
    return "b";
  throw badRequest(messages.winnerMustBeParticipatingTeam);
}

function registerComplete(routes: Hono<AppBindings>): void {
  // F23 — ADR-114/152: the score decides it; the winner the marshal names must agree with it.
  routes.post("/matches/:matchId/complete", async (c) => {
    requireFacilitator(c);
    const body = await readBody(c, completeMatchRequestSchema);
    const { day, match } = await liveMatch(c, requireParam(c, "matchId"));
    const namedWinner = sideOfTeam(day, { match, teamId: body.winnerTeamId });
    assertResultMatchesScore(matchView(day.context, match), body.winnerTeamId, {
      stage: matchStageOf(day.context, match),
      tiebreakMethod: body.tiebreakMethod,
    });
    await withTournamentWrite(
      c.get("db"),
      { now: new Date(), isResult: true },
      () =>
        run(c, (state, context) =>
          completeMatch(
            state,
            { matchId: match.id, namedWinner, tiebreakMethod: body.tiebreakMethod },
            context,
          ),
        ),
    );
    const view = await viewOf(c.get("db"), match.id);
    publishFeedMatch(view);
    // ADR-131 (B6) — a completion is the ordinary act that moves the board.
    await pushLeaderboard(c.get("db"));
    return c.json({ match: view });
  });
}

function registerCancel(routes: Hono<AppBindings>): void {
  /*
   * F24 — only the facilitator who started it. A match the schedule owed goes back in the queue
   * (the matchup is still owed); an ad-hoc one is cancelled (ADR-277). Either way the court is
   * free, so the answer — and the feed frame — is that match, called off.
   */
  routes.post("/matches/:matchId/cancel", async (c) => {
    requireFacilitator(c);
    const { day, match } = await liveMatch(c, requireParam(c, "matchId"));
    await withTournamentWrite(
      c.get("db"),
      { now: new Date(), isResult: false },
      () => run(c, (state, context) => callOff(state, { matchId: match.id }, context)),
    );
    const view: MatchView = {
      ...matchView(day.context, match),
      status: "cancelled",
    };
    publishFeedMatch(view);
    return c.json({ match: view });
  });
}

export function registerMatchActions(routes: Hono<AppBindings>): void {
  registerStart(routes);
  registerScore(routes);
  registerComplete(routes);
  registerCancel(routes);
}
