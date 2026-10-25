import type {
  OperationsFacilitatorView,
  OperationsOverviewView,
  OperationsStationView,
} from '@psd/contracts';
import type { AppDatabase } from '../db/client.js';
import type { Match } from '@psd/tournament/core';
import {
  countTeams,
  countRecentClaimsByStation,
  countRecentScansByActivity,
  listActivities,
  listFacilitators,
  listOpenFringeRounds,
  listOpenSwagRounds,
  listSwagStations,
  type OpenRoundRow,
  type StationActivityRow,
} from '../db/entities/index.js';
import { iso, isoOrNull } from './http.js';
import { readDay } from '../routes-tournament/support.js';
import { findScheduler } from '../tournament-scheduler/scheduler.js';
import { matchView, type ViewContext } from '../views/tournament.js';

/**
 * ADR-151 — "is anything still happening", answered in one read.
 *
 * The dashboard it sits above has eight tiles and every one of them is a total since the
 * database was created. At 11:15 it says `Scans 1,842`, and that number is exactly as true,
 * and exactly as useless, at 11:16. The questions actually being asked from the laptop are
 * all about a window: what moved in the last quarter of an hour, which station has gone
 * quiet with a round still open, which match has been on court too long, and which marshals
 * are still holding a phone that is talking to the server.
 *
 * ONE endpoint, deliberately. The browser polling five of these on five timers is what
 * ADR-003's single serialized connection cannot afford; the number of queries inside is
 * fixed, and each is bounded by the station or court count rather than by the day's volume.
 */

export const OPERATIONS_WINDOW_MINUTES = 15;

/** What a match is planned for when no scheduler names a length (open play, or no tournament). */
const DEFAULT_MATCH_MINUTES = 12;

interface TournamentHalf {
  matchMinutes: number;
  matchesCompleted: number;
  teamsOutside: OperationsOverviewView['teamsOutside'];
  liveMatches: OperationsOverviewView['liveMatches'];
}

const QUIET_DAY: TournamentHalf = { matchMinutes: DEFAULT_MATCH_MINUTES, matchesCompleted: 0, teamsOutside: { count: 0, canAdmit: false }, liveMatches: [] };

/**
 * ADR-280 — the tournament half of the panel, off the rebuilt tournament: live matches with their
 * elapsed time against the planned length (longest first), results in the window, and the teams that
 * exist but were not entered. Late admission is not offered by the rebuild, so `canAdmit` is false.
 */
async function tournamentHalf(db: AppDatabase, input: { now: Date; since: Date }): Promise<TournamentHalf> {
  const day = await readDay(db);
  if (day === null || day.row.status !== 'live') return QUIET_DAY;
  const { state } = day.context;
  const entered = new Set(day.context.teamOf.values());
  const teams = await countTeams(db);
  const scheduler = await findScheduler(db, day.row.id);
  const liveMatches = state.matches
    .filter((match) => match.status === 'in_progress')
    .map((match) => liveMatchView(day.context, { match, now: input.now }))
    .sort((left, right) => right.elapsedMinutes - left.elapsedMinutes);
  return {
    matchMinutes: scheduler?.matchMinutes ?? DEFAULT_MATCH_MINUTES,
    matchesCompleted: state.matches.filter((match) => match.status === 'completed' && match.endedAt !== null && new Date(match.endedAt) >= input.since).length,
    teamsOutside: { count: Math.max(0, teams - entered.size), canAdmit: false },
    liveMatches,
  };
}

function liveMatchView(context: ViewContext, input: { match: Match; now: Date }): OperationsOverviewView['liveMatches'][number] {
  const view = matchView(context, input.match);
  const elapsedMinutes = Math.floor((input.now.getTime() - new Date(view.startedAt).getTime()) / 60_000);
  return {
    id: view.id,
    courtLabel: view.courtLabel,
    teamAName: view.teamAName,
    teamBName: view.teamBName,
    scoreA: view.scoreA,
    scoreB: view.scoreB,
    startedAt: view.startedAt,
    elapsedMinutes,
    isOverdue: elapsedMinutes > input.match.plannedMinutes,
  };
}

export async function readOperationsOverview(db: AppDatabase): Promise<OperationsOverviewView> {
  const now = new Date();
  const since = new Date(now.getTime() - OPERATIONS_WINDOW_MINUTES * 60_000);
  const parts = await gather(db, since);
  const stations = [
    ...fringeStations(parts, since),
    ...swagStations(parts, since),
  ].sort(byQuietThenName);
  const tournament = await tournamentHalf(db, { now, since });
  return {
    generatedAt: iso(now),
    windowMinutes: OPERATIONS_WINDOW_MINUTES,
    matchMinutes: tournament.matchMinutes,
    scanCount: total(parts.scans),
    claimCount: total(parts.claims),
    matchesCompleted: tournament.matchesCompleted,
    teamsOutside: tournament.teamsOutside,
    stations,
    liveMatches: tournament.liveMatches,
    facilitators: parts.facilitators.map((row) => facilitatorView(row, since)),
  };
}

interface OverviewParts {
  activities: { id: string; activityName: string; isActive: boolean }[];
  swag: { id: string; stationName: string; isActive: boolean }[];
  scans: StationActivityRow[];
  claims: StationActivityRow[];
  openFringe: OpenRoundRow[];
  openSwag: OpenRoundRow[];
  facilitators: {
    id: string;
    username: string;
    displayLabel: string | null;
    defaultStationLabel: string | null;
    lastSeenAt: Date | null;
  }[];
}

/**
 * Sequential, not `Promise.all`. The database is one serialized connection (ADR-003), so
 * firing nine reads at once buys no wall-clock time and only lengthens the queue that the
 * live match scores are waiting in.
 */
async function gather(db: AppDatabase, since: Date): Promise<OverviewParts> {
  return {
    activities: await listActivities(db),
    swag: await listSwagStations(db),
    scans: await countRecentScansByActivity(db, since),
    claims: await countRecentClaimsByStation(db, since),
    openFringe: await listOpenFringeRounds(db),
    openSwag: await listOpenSwagRounds(db),
    facilitators: await listFacilitators(db),
  };
}

function total(rows: readonly StationActivityRow[]): number {
  return rows.reduce((sum, row) => sum + row.recentCount, 0);
}

function fringeStations(parts: OverviewParts, since: Date): OperationsStationView[] {
  return parts.activities
    .filter((activity) => activity.isActive)
    .map((activity) =>
      stationView({
        kind: 'fringe',
        id: activity.id,
        name: activity.activityName,
        rounds: parts.openFringe,
        events: parts.scans,
        since,
      }),
    );
}

function swagStations(parts: OverviewParts, since: Date): OperationsStationView[] {
  return parts.swag
    .filter((station) => station.isActive)
    .map((station) =>
      stationView({
        kind: 'swag',
        id: station.id,
        name: station.stationName,
        rounds: parts.openSwag,
        events: parts.claims,
        since,
      }),
    );
}

interface StationInput {
  kind: 'fringe' | 'swag';
  id: string;
  name: string;
  rounds: readonly OpenRoundRow[];
  events: readonly StationActivityRow[];
  since: Date;
}

function stationView(input: StationInput): OperationsStationView {
  const round = input.rounds.find((row) => row.stationId === input.id) ?? null;
  const events = input.events.find((row) => row.stationId === input.id) ?? null;
  const recentCount = events?.recentCount ?? 0;
  /*
   * Quiet is measured from the round, not from the window: a round opened ninety seconds ago
   * with no scans yet is a marshal getting started, and calling that a problem would train
   * the superadmin to ignore the mark by half past nine.
   */
  const settled = round !== null && round.openedAt <= input.since;
  return {
    kind: input.kind,
    id: input.id,
    name: input.name,
    openRoundNumber: round?.roundNumber ?? null,
    recentCount,
    lastEventAt: isoOrNull(events?.lastEventAt ?? null),
    isQuiet: settled && recentCount === 0,
  };
}

/** Quiet stations first: the panel is read top-down and they are the reason to read it. */
function byQuietThenName(left: OperationsStationView, right: OperationsStationView): number {
  if (left.isQuiet !== right.isQuiet) return left.isQuiet ? -1 : 1;
  return left.name.localeCompare(right.name);
}

function facilitatorView(
  row: OverviewParts['facilitators'][number],
  since: Date,
): OperationsFacilitatorView {
  return {
    id: row.id,
    username: row.username,
    displayLabel: row.displayLabel,
    defaultStationLabel: row.defaultStationLabel,
    lastSeenAt: isoOrNull(row.lastSeenAt),
    isActive: row.lastSeenAt !== null && row.lastSeenAt >= since,
  };
}
