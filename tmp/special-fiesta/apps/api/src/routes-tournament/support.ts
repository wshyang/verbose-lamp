import { asc } from "drizzle-orm";
import type { TeamUpSoonView } from "@psd/contracts";
import type {
  Actor as EngineActor,
  Match,
  TournamentState,
} from "@psd/tournament/core";
import type { AppDatabase, Executor } from "../db/client.js";
import {
  tournamentCourts,
  type TournamentCourtRow,
  type TournamentRow,
} from "../db/schema/index.js";
import {
  LIVE_MATCH_TAG,
  SCOREBOARD_TAG,
  TOURNAMENT_TAG,
  cachedRead,
  invalidateTag,
} from "../lib/cache.js";
import type { FacilitatorActor, SuperadminActor } from "../lib/session.js";
import { readersDay } from "../tournament/dayPolicy.js";
import {
  entrantTeams,
  loadState,
} from "../tournament/load.js";
import { reconcile } from "../tournament-scheduler/planning.js";
import { finishDrain } from "../tournament-mode/drain.js";
import { sweepRosters } from "./bridge.js";
import { findScheduler } from "../tournament-scheduler/scheduler.js";
import type { ViewContext } from "../views/tournament.js";

/**
 * ADR-277 — the composition root's half of the tournament: the one place that knows the core
 * adapter, the scheduler adapter AND the app (ADR-272). It reads the day once into a `ViewContext`
 * the compatibility views fill the kept wire types from, maps a staff session to the engine's actor,
 * and runs what a write means for the rest of the app — the caches it voids and the re-plan.
 */

export interface DayPicture {
  row: TournamentRow;
  context: ViewContext;
  courts: readonly TournamentCourtRow[];
}

export async function readCourtRows(
  db: Executor,
): Promise<TournamentCourtRow[]> {
  return db
    .select()
    .from(tournamentCourts)
    .orderBy(asc(tournamentCourts.courtNumber));
}

/**
 * One tournament as the views need it, whichever tournament it is: the day's own reader asks this of
 * the day, and the mixed feed (ADR-341) asks it of the fixture day a switch retired.
 */
export async function pictureOfRow(
  db: Executor,
  row: TournamentRow,
): Promise<DayPicture> {
  const courts = await readCourtRows(db);
  const scheduler = await findScheduler(db, row.id);
  const context: ViewContext = {
    state: await loadState(db, row),
    teamOf: await entrantTeams(db, row.id),
    courtLabels: new Map(courts.map((court) => [court.id, court.label])),
    formatId: scheduler?.format ?? null,
  };
  return { row, context, courts };
}

async function dayFromDb(db: Executor): Promise<DayPicture | null> {
  const row = await readersDay(db);
  if (row === null) return null;
  return pictureOfRow(db, row);
}

/**
 * The day, as every reader sees it: the live tournament, else the last one closed (its results stand). Every poll asks this, so it is remembered for two
 * seconds and voided by every tournament write (`afterWrite`) — a point press included, because the
 * live score is part of the picture.
 */
export const readDay = cachedRead(dayFromDb, {
  name: "tournament.day",
  ttlMs: 2_000,
  tags: [TOURNAMENT_TAG, LIVE_MATCH_TAG],
});

/** A staff session as the engine records it: kind, id, and the name the room knows them by. */
export function engineActorOf(
  actor: FacilitatorActor | SuperadminActor,
): EngineActor {
  if (actor.type === "facilitator")
    return {
      kind: "facilitator",
      id: actor.facilitator.id,
      label: actor.facilitator.username,
    };
  return {
    kind: "superadmin",
    id: actor.superadmin.id,
    label: actor.superadmin.username,
  };
}

/** App team id → this tournament's entrant id: the seam, read the other way. */
export function entrantOfTeam(
  context: ViewContext,
  teamId: string,
): string | null {
  for (const [entrantId, mapped] of context.teamOf)
    if (mapped === teamId) return entrantId;
  return null;
}

function isPlayed(match: Match): boolean {
  return match.status !== "scheduled" && match.result?.kind !== "bye";
}

function newestStartFirst(left: Match, right: Match): number {
  return (right.startedAt ?? "").localeCompare(left.startedAt ?? "");
}

/** Matches a team had a seat in, newest first — the team page's history (S17). Byes are not matches. */
export function matchesOfTeam(context: ViewContext, teamId: string): Match[] {
  const entrantId = entrantOfTeam(context, teamId);
  if (entrantId === null) return [];
  const seated = (match: Match) =>
    match.slots.a.seatedEntrantId === entrantId ||
    match.slots.b.seatedEntrantId === entrantId;
  return context.state.matches
    .filter((match) => isPlayed(match) && seated(match))
    .sort(newestStartFirst);
}

/** The feed (S60, ADR-109): live matches first, then the finished ones, each newest first. */
export function feedMatches(state: TournamentState): Match[] {
  const live = state.matches
    .filter((match) => match.status === "in_progress")
    .sort(newestStartFirst);
  const done = state.matches
    .filter((match) => match.status === "completed" && isPlayed(match))
    .sort(newestStartFirst);
  return [...live, ...done];
}

/** An instant to sort by; a match with no planned time sorts after every one that has one. */
export function plannedMs(at: string | null): number {
  return at === null ? Number.POSITIVE_INFINITY : Date.parse(at);
}

function playOrder(left: Match, right: Match): number {
  const isLive = (match: Match) => (match.status === "in_progress" ? 0 : 1);
  if (isLive(left) !== isLive(right)) return isLive(left) - isLive(right);
  // Numbers, not strings: `localeCompare` sorts a placeholder like '~' BEFORE an ISO instant.
  return (
    plannedMs(left.plannedStartAt) - plannedMs(right.plannedStartAt) ||
    left.sequence - right.sequence
  );
}

/** The unresolved matches in play order: live ones, then by planned start, then the structure's order. */
export function lineupMatches(state: TournamentState): Match[] {
  return state.matches
    .filter(
      (match) => match.status === "scheduled" || match.status === "in_progress",
    )
    .sort(playOrder);
}

const NOT_UP_SOON: TeamUpSoonView = {
  upSoon: false,
  gamesAway: null,
  fixtureId: null,
};

/**
 * ADR-091, kept — a team is up soon while its next unresolved match sits within the first N line-up
 * rows, N the courts running. `gamesAway` is that row (0 = next, or already live). A seat counts once
 * the team is known in it — frozen, or named by the structure itself.
 */
export function upSoonOf(picture: DayPicture, teamId: string): TeamUpSoonView {
  const entrantId = entrantOfTeam(picture.context, teamId);
  if (entrantId === null) return NOT_UP_SOON;
  const depth = Math.max(
    1,
    picture.courts.filter((court) => court.isEnabled).length,
  );
  const knows = (slot: Match["slots"]["a"]) =>
    slot.seatedEntrantId === entrantId ||
    (slot.source.kind === "entrant" && slot.source.entrantId === entrantId);
  const rows = lineupMatches(picture.context.state).slice(0, depth);
  const index = rows.findIndex(
    (match) => knows(match.slots.a) || knows(match.slots.b),
  );
  const found = rows[index];
  return found === undefined
    ? NOT_UP_SOON
    : { upSoon: true, gamesAway: index, fixtureId: found.id };
}

/** A point press: the live picture is void, and nothing else — a point moves no plan and pays nobody (ADR-120). */
export function afterScore(): void {
  invalidateTag(LIVE_MATCH_TAG);
}

/**
 * What a tournament write means for the rest of the app: the day's caches are void, the board's too
 * when a result moved, and the scheduler re-plans (a no-op once terminated, or for open play).
 */
export async function afterWrite(
  db: AppDatabase,
  input: { now: Date; isResult: boolean },
): Promise<void> {
  invalidateTag(TOURNAMENT_TAG);
  invalidateTag(LIVE_MATCH_TAG);
  if (input.isResult) invalidateTag(SCOREBOARD_TAG);
  const moved = await reconcile(db, input.now);
  // ADR-276 — the scheduler's own payments (a Swiss bye) are given their rosters here.
  const frozen = await sweepRosters(db);
  if (moved.length > 0 || frozen > 0) invalidateTag(TOURNAMENT_TAG);
  if (frozen > 0) invalidateTag(SCOREBOARD_TAG);
  // ADR-336 §6.4 — if that write took the last match off court mid-switch, the retired bracket ends
  // here, as the system, in the switch's own words. A no-op on every other write: no switch, one
  // indexed read. Deliberately after the caller's own commit, so a close that refuses can never fail
  // the completion that triggered it (§11).
  const ended = await finishDrain(db, { now: input.now });
  if (ended !== null) {
    invalidateTag(TOURNAMENT_TAG);
    invalidateTag(SCOREBOARD_TAG);
  }
}

/**
 * ADR-346 — the only way a route writes the tournament day. The write commits; the follow-through
 * (invalidate → reconcile → sweepRosters → finishDrain, above) runs after it, exactly as ADR-336
 * §11 ordered: a refusing close must never fail the completion that triggered it. A write that
 * throws (a refusal) runs no follow-through, as before. The pair being one expression is the
 * whole point (S9): the follow-through stops being a step a caller can return without — the
 * standards rule `tournament-after-write` keeps `afterWrite` itself housebound to this file.
 *
 * This wrapper lives in the routes layer on purpose: `afterWrite` composes the scheduler's
 * reconcile, the mode's drain and the bridge's roster sweep, and ADR-272's direction rule allows
 * only the composition root to see all three. Moving it into `tournament/` means re-housing
 * `sweepRosters` first — that is S8's follow-up, recorded in the ADR-346 entry, not smuggled
 * into that phase.
 */
export async function withTournamentWrite<T>(
  db: AppDatabase,
  opts: { now: Date; isResult: boolean },
  write: () => Promise<T>,
): Promise<T> {
  const outcome = await write();
  await afterWrite(db, opts);
  return outcome;
}

/**
 * ADR-282 — the scheduler's clock. Writes re-plan as they happen (`afterWrite`); this re-plans as time
 * passes when nobody writes: a match running long pushes everything behind it, and the plan should
 * say so before anyone has to ask. A no-op without a running scheduler. Never rejects: a failed
 * re-plan is logged and the next tick tries again.
 */
export const RECONCILE_TICK_MS = 60_000;

let tickInFlight = false;

/** The suite shares a module registry, so a tick left running by one test must not block the next. */
export function resetTickGuardForTests(): void {
  tickInFlight = false;
}

/**
 * ADR-324 — one re-plan at a time. When the database stalls, a tick waits on it; without this
 * guard every minute added another waiter holding a pool connection, which is how a slow
 * database became a starved pool. A skipped tick loses nothing: the next one re-plans from
 * whatever has changed.
 */
export async function tickSchedule(db: AppDatabase, now: Date): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    await afterWrite(db, { now, isResult: false });
  } catch (error) {
    console.error(
      "[api] scheduler tick failed",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    tickInFlight = false;
  }
}
