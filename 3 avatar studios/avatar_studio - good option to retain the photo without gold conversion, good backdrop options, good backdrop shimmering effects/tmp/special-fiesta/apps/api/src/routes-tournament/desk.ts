import type {
  AdminMatchView,
  AdminTournamentConsoleView,
  AdminTournamentView,
  AwardTier,
  ContingencyPreviewView,
  FitView,
  TimetableView,
  TournamentEventView,
} from "@psd/contracts";
import type { Match } from "@psd/tournament/core";
import { plan } from "@psd/tournament/scheduler";
import type { AppDatabase, Executor } from "../db/client.js";
import { listTeams } from "../db/entities/index.js";
import type { TournamentRow } from "../db/schema/index.js";
import {
  entrantTeams,
  listEvents,
  loadState,
} from "../tournament/load.js";
import { deskDay, liveBracket } from "../tournament/dayPolicy.js";
import { readModeSwitch } from "../tournament-mode/drain.js";
import { readOperatingMode } from "../tournament-mode/mode.js";
import { pendingRequestView } from "../tournament-mode/requests.js";
import { deriveAwardTiers } from "../tournament-mode/tiers.js";
import type { ContingencyPreview } from "../tournament-scheduler/control.js";
import { planInputOf } from "../tournament-scheduler/planning.js";
import { findScheduler, pinnedIds } from "../tournament-scheduler/scheduler.js";
import type { ViewContext } from "../views/tournament.js";
import {
  adminCourtView,
  adminEntrantViews,
  adminMatchView,
  adminSchedulerView,
  adminStageViews,
  fitView,
  placementChangeView,
  unplacedMatches,
} from "../views/tournamentAdmin.js";
import { plannedMs, readCourtRows } from "./support.js";

/**
 * ADR-279 — the desk's reads: the Control subtab's one read, the Timetable's court lanes, the event
 * log. The desk sees drafts and the scheduler's own state, which the kept surfaces never do, so this
 * is a separate, uncached read: a handful of superadmins, not three hundred phones.
 */

/** How many history lines the console shows. */
const EVENT_LIMIT = 200;

interface Desk {
  row: TournamentRow;
  context: ViewContext;
  pinned: ReadonlySet<string>;
}

async function readDesk(db: Executor): Promise<Desk | null> {
  const row = await deskDay(db);
  if (row === null) return null;
  const state = await loadState(db, row);
  const courts = await readCourtRows(db);
  const scheduler = await findScheduler(db, row.id);
  const context: ViewContext = {
    state,
    teamOf: await entrantTeams(db, row.id),
    courtLabels: new Map(courts.map((court) => [court.id, court.label])),
    formatId: scheduler?.format ?? null,
  };
  return {
    row,
    context,
    pinned: await pinnedIds(
      db,
      state.matches.map((match) => match.id),
    ),
  };
}

/** How the rest of the day fits, by the planner's own reckoning. Only a running scheduler has a plan. */
async function fitOf(
  db: Executor,
  input: { desk: Desk; now: Date },
): Promise<FitView | null> {
  const scheduler = await findScheduler(db, input.desk.row.id);
  if (scheduler === null || scheduler.status !== "active") return null;
  const { state } = input.desk.context;
  return fitView(
    plan(
      planInputOf({
        state,
        scheduler,
        pinned: input.desk.pinned,
        now: input.now,
      }),
    ).fit,
  );
}

async function tournamentView(
  db: Executor,
  input: { desk: Desk; now: Date },
): Promise<AdminTournamentView> {
  const { row, context, pinned } = input.desk;
  const scheduler = await findScheduler(db, row.id);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    kind: row.kind,
    rates: { win: row.winPoints, draw: row.drawPoints, loss: row.lossPoints },
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    closeReason: row.closeReason,
    revision: row.revision,
    entrants: adminEntrantViews(context),
    stages: adminStageViews(context),
    matches: context.state.matches.map((match) =>
      adminMatchView(context, { match, pinned }),
    ),
    scheduler: scheduler === null ? null : adminSchedulerView(scheduler),
    draftSetup: row.draftSetup,
    dumbTiers: row.dumbTiers ?? [],
    fit: await fitOf(db, input),
  };
}

/** The Control subtab, whole: the venue, the desk's tournament, and the teams the setup form can enter. */
export async function readConsole(
  db: AppDatabase,
  now: Date,
): Promise<AdminTournamentConsoleView> {
  const desk = await readDesk(db);
  const teams = await listTeams(db);
  return {
    courts: (await readCourtRows(db)).map(adminCourtView),
    tournament: desk === null ? null : await tournamentView(db, { desk, now }),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.teamName,
      memberCount: team.memberCount,
    })),
    // ADR-336 — the desk is told which game the room is playing rather than inferring it from a
    // paused badge, and the switch dialog opens with the day's own paid rates already as buttons.
    mode: await readOperatingMode(db),
    modeSwitch: await readModeSwitch(db),
    modeRequest: await pendingRequestView(db),
    suggestedTiers: await suggestedTiers(db),
  };
}

/** §4 — the buttons a switch would start with, derived from the live bracket's own paid rates. */
async function suggestedTiers(db: AppDatabase): Promise<AwardTier[]> {
  const bracket = await liveBracket(db);
  if (bracket === null) return [];
  return deriveAwardTiers(await loadState(db, bracket));
}

function startOf(match: Match): number {
  return plannedMs(match.startedAt ?? match.plannedStartAt);
}

function laneMatches(desk: Desk, courtId: string): AdminMatchView[] {
  return desk.context.state.matches
    .filter(
      (match) => match.courtId === courtId && match.result?.kind !== "bye",
    )
    .sort((left, right) => startOf(left) - startOf(right))
    .map((match) =>
      adminMatchView(desk.context, { match, pinned: desk.pinned }),
    );
}

/** The Timetable subtab: one lane per court in planned order, and whatever the planner could not place. */
export async function readTimetable(
  db: AppDatabase,
  now: Date,
): Promise<TimetableView> {
  const courts = await readCourtRows(db);
  const desk = await readDesk(db);
  if (desk === null)
    return {
      now: now.toISOString(),
      lanes: courts.map((court) => ({
        court: adminCourtView(court),
        matches: [],
      })),
      unplaced: [],
      fit: null,
    };
  return {
    now: now.toISOString(),
    lanes: courts.map((court) => ({
      court: adminCourtView(court),
      matches: laneMatches(desk, court.id),
    })),
    unplaced: unplacedMatches(desk.context.state).map((match) =>
      adminMatchView(desk.context, { match, pinned: desk.pinned }),
    ),
    fit: await fitOf(db, { desk, now }),
  };
}

export async function readEventLog(
  db: AppDatabase,
): Promise<TournamentEventView[]> {
  const row = await deskDay(db);
  if (row === null) return [];
  const events = await listEvents(db, {
    tournamentId: row.id,
    limit: EVENT_LIMIT,
  });
  return events.map((event) => ({
    at: event.at.toISOString(),
    kind: event.kind,
    actorLabel: event.actorLabel,
    matchId: event.matchId,
    reason: event.reason,
  }));
}

/** A contingency preview in the desk's words: court labels and instants, not ids and minutes. */
export async function contingencyView(
  db: AppDatabase,
  preview: Extract<ContingencyPreview, { ok: true }>,
): Promise<ContingencyPreviewView> {
  const desk = await readDesk(db);
  const changes =
    desk === null
      ? []
      : preview.changes.map((change) =>
          placementChangeView(desk.context, change),
        );
  return { changes, fit: fitView(preview.fit) };
}
