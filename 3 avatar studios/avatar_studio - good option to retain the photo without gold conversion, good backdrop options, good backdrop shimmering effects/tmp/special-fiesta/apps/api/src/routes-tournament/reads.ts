import type { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import type { CourtView, FixtureView, TournamentBracketView } from '@psd/contracts';
import { messages } from '@psd/contracts';
import type { AppDatabase } from '../db/client.js';
import { findActiveMembership } from '../db/entities/index.js';
import { firstOrNull, required } from '../db/rows.js';
import {
  tournamentModeChanges,
  tournaments,
  type TournamentCourtRow,
} from '../db/schema/index.js';
import { notFound, requireParam, respondCached } from '../lib/http.js';
import { requireAnyActor, requireFacilitator, requireViewer, type AppBindings, type Viewer } from '../lib/session.js';
import { bracketView, courtView, fixtureView, matchView, tournamentView, type ViewContext } from '../views/tournament.js';
import { readOperatingMode, isAwarding } from '../tournament-mode/mode.js';
import { dumbDay } from '../tournament/dayPolicy.js';
import { dumbFeedEntries } from './dumb.js';
import { feedMatches, lineupMatches, pictureOfRow, readCourtRows, readDay, upSoonOf, type DayPicture } from './support.js';

/**
 * ADR-277 — the tournament's reads, at the paths the kept participant, facilitator and hall-screen
 * code already calls, in the wire shapes it already imports. Every one reads the cached day
 * (`readDay`) and shapes it through the compatibility views; none reads a table of its own.
 */

/** How many teams the court picker pins under "Recently on this court" (ADR-097). */
const RECENT_TEAMS_LIMIT = 3;

/** How many of the queue's next matches the console offers as speed starts (ADR-108). */
const OFFER_LIMIT = 5;

/** ADR-150 — before any tournament is live the hall screen draws an empty plan. */
const PLANNED_BRACKET: TournamentBracketView = {
  status: 'planned',
  format: 'world_cup',
  teamCount: 0,
  groupSize: 0,
  advanceCount: 0,
  hasThirdPlace: false,
  knockoutPairing: 'classic',
  groups: [],
  rounds: [],
};

/** The day a reader sees has always started (`readersDay`/`dumbDay` show no draft and no discarded one). */
function startedAtOf(day: DayPicture): string {
  return required(day.row.startedAt, 'day start').toISOString();
}

/** A court with no tournament at all: the venue still exists, and nothing is being played on it. */
function idleCourtView(court: TournamentCourtRow): CourtView {
  return {
    id: court.id,
    courtNumber: court.courtNumber,
    displayLabel: court.label,
    isEnabled: court.isEnabled,
    assignedFacilitatorId: null,
    assignedFacilitatorUsername: null,
    currentMatchId: null,
  };
}

async function requireCourt(db: AppDatabase, courtId: string): Promise<void> {
  const courts = await readCourtRows(db);
  if (!courts.some((court) => court.id === courtId)) throw notFound(messages.courtNotFound);
}

/** A finished match on a court has both seats frozen (a bye is never on a court) and ended at a time. */
function recentTeams(context: ViewContext, courtId: string): string[] {
  const finished = context.state.matches
    .filter((match) => match.status === 'completed' && match.courtId === courtId)
    .sort((left, right) => required(right.endedAt, 'end').localeCompare(required(left.endedAt, 'end')));
  const teamOf = (entrantId: string | null) => required(context.teamOf.get(required(entrantId, 'seat')), 'entrant team');
  const teamIds = finished.flatMap((match) => [teamOf(match.slots.a.seatedEntrantId), teamOf(match.slots.b.seatedEntrantId)]);
  return [...new Set(teamIds)].slice(0, RECENT_TEAMS_LIMIT);
}

function registerCourtReads(routes: Hono<AppBindings>): void {
  // ADR-135 — polled by every court console; a 304 is the normal answer.
  routes.get('/courts', async (c) => {
    requireAnyActor(c);
    const day = await readDay(c.get('db'));
    const courts = day?.courts ?? (await readCourtRows(c.get('db')));
    const items = courts.map((court) => (day === null ? idleCourtView(court) : courtView(day.context, court)));
    return respondCached(c, { items });
  });

  // S21 #surf-court-view
  routes.get('/courts/:courtId/current-match', async (c) => {
    requireFacilitator(c);
    const courtId = requireParam(c, 'courtId');
    await requireCourt(c.get('db'), courtId);
    const day = await readDay(c.get('db'));
    const live = day?.context.state.matches.find((match) => match.status === 'in_progress' && match.courtId === courtId);
    return c.json({ match: day !== null && live !== undefined ? matchView(day.context, live) : null });
  });

  // ADR-284 — the court console's Line-ups subtab: what is planned on this court, in play order.
  routes.get('/courts/:courtId/lineups', async (c) => {
    requireFacilitator(c);
    const courtId = requireParam(c, 'courtId');
    await requireCourt(c.get('db'), courtId);
    const day = await readDay(c.get('db'));
    if (day === null || day.row.status !== 'live') return c.json({ items: [] });
    const here = lineupMatches(day.context.state).filter((match) => match.courtId === courtId);
    return c.json({ items: here.map((match) => fixtureView(day.context, match)) });
  });

  // ADR-097 — the teams that most recently finished a match here, for the picker's pinned group.
  routes.get('/courts/:courtId/recent-teams', async (c) => {
    requireFacilitator(c);
    const courtId = requireParam(c, 'courtId');
    await requireCourt(c.get('db'), courtId);
    const day = await readDay(c.get('db'));
    return c.json({ teamIds: day === null ? [] : recentTeams(day.context, courtId) });
  });
}

/**
 * ADR-341 (§7 option B) — Results on a day that is awarding points.
 *
 * A one-way switch does not un-play the morning. When *this* award day was switched from a fixture
 * day, that bracket's finished matches stay in `items` and the answer says `mixed`, so the
 * participant sees the award ledger first and the matches they actually watched underneath it. A day
 * that began dumb has no such predecessor and answers `dumb`, exactly as it did before.
 *
 * The predecessor is read from the mode-change log rather than assumed to be "the last closed
 * bracket": a demo day may run fixtures and then a separate dumb day, and the room that watched the
 * fixtures still deserves them — but a dumb day next month must not inherit this month's matches.
 *
 * Only finished matches: a live one is on its court page and in the Line-ups tab, and calling it a
 * result before it ends would be a small lie the room can check on the court beside them.
 */
async function awardingFeed(db: AppDatabase) {
  const awardDay = await dumbDay(db);
  const earlier = awardDay === null ? [] : await retiredResults(db, awardDay.id);
  return {
    items: earlier,
    mode: earlier.length === 0 ? ("dumb" as const) : ("mixed" as const),
    awards: await dumbFeedEntries(db),
  };
}

/** The matches the switch retired, when this award day is one a switch created. */
async function retiredResults(db: AppDatabase, awardTournamentId: string) {
  const change = firstOrNull(
    await db
      .select()
      .from(tournamentModeChanges)
      .where(eq(tournamentModeChanges.dumbTournamentId, awardTournamentId))
      .orderBy(desc(tournamentModeChanges.switchedAt))
      .limit(1),
  );
  if (change === null) return [];
  const fixtures = firstOrNull(
    await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, change.fixturesTournamentId)),
  );
  if (fixtures === null) return [];
  const picture = await pictureOfRow(db, fixtures);
  return feedMatches(picture.context.state)
    .filter((match) => match.status === "completed")
    .map((match) => matchView(picture.context, match));
}

function registerMatchReads(routes: Hono<AppBindings>): void {
  // S60 #surf-match-feed — ADR-109: live matches lead, the finished history follows; ADR-140: the hall screen too.
  routes.get('/matches/feed', async (c) => {
    requireViewer(c);
    const db = c.get('db');
    // ADR-321 — while dumb courts are operating there are no matches to feed: Results is the
    // award ledger, one "Team XXX is awarded XXX points!" line per award. ADR-336 — the answer
    // follows the day's mode rather than "is a dumb tournament live", so there is one place that
    // decides which game the room is playing.
    const mode = await readOperatingMode(db);
    const dumb = await dumbDay(db);
    if (isAwarding(mode)) {
      return respondCached(c, await awardingFeed(db));
    }
    const day = await readDay(db);
    if (day === null && dumb !== null) {
      return respondCached(c, await awardingFeed(db));
    }
    const items = day === null ? [] : feedMatches(day.context.state).map((match) => matchView(day.context, match));
    return respondCached(c, { items, mode: 'matches', awards: [] });
  });

  routes.get('/matches/:matchId', async (c) => {
    requireAnyActor(c);
    const day = await readDay(c.get('db'));
    const match = day?.context.state.matches.find((row) => row.id === requireParam(c, 'matchId'));
    if (day === null || match === undefined || match.status === 'scheduled') throw notFound(messages.matchNotFound);
    return c.json({ match: matchView(day.context, match) });
  });

  // ADR-150 — the day's shape for the hall screen.
  routes.get('/bracket', async (c) => {
    requireViewer(c);
    const day = await readDay(c.get('db'));
    return c.json({ bracket: day === null ? PLANNED_BRACKET : bracketView(day.context) });
  });
}

/** The queue's next startable matches: both teams known, neither playing, this court's own first. */
function offersFor(day: DayPicture, courtId: string | null): FixtureView[] {
  const live = day.context.state.matches.filter((match) => match.status === 'in_progress');
  const busy = new Set(live.flatMap((match) => [match.slots.a.seatedEntrantId, match.slots.b.seatedEntrantId]));
  const startable = lineupMatches(day.context.state)
    .filter((match) => match.status === 'scheduled')
    .map((match) => ({ match, view: fixtureView(day.context, match) }))
    .filter((row) => row.view.teamAId !== null && row.view.teamBId !== null)
    .filter((row) => !busy.has(row.match.slots.a.seatedEntrantId) && !busy.has(row.match.slots.b.seatedEntrantId));
  const here = startable.filter((row) => row.match.courtId === courtId);
  const elsewhere = startable.filter((row) => row.match.courtId !== courtId);
  return [...here, ...elsewhere].slice(0, OFFER_LIMIT).map((row) => row.view);
}

function pendingPairsOf(day: DayPicture): { fixtureId: string; teamAId: string; teamBId: string }[] {
  return lineupMatches(day.context.state)
    .filter((match) => match.status === 'scheduled')
    .map((match) => fixtureView(day.context, match))
    .flatMap((view) => (view.teamAId !== null && view.teamBId !== null ? [{ fixtureId: view.id, teamAId: view.teamAId, teamBId: view.teamBId }] : []));
}

/** ADR-091 — only a participant on a team can be "up soon"; staff and the hall screen read the list. */
async function viewerUpSoonFor(db: AppDatabase, input: { viewer: Viewer; day: DayPicture }) {
  if (input.viewer.type !== 'participant') return null;
  const membership = await findActiveMembership(db, input.viewer.participant.id);
  if (membership === null) return null;
  const upSoon = upSoonOf(input.day, membership.teamId);
  if (upSoon.fixtureId === null || upSoon.gamesAway === null) return null;
  return { fixtureId: upSoon.fixtureId, gamesAway: upSoon.gamesAway };
}

function registerScheduleReads(routes: Hono<AppBindings>): void {
  // ADR-089 — the court console's prepopulation feed: this court's queued matches first.
  routes.get('/schedule', async (c) => {
    requireFacilitator(c);
    const day = await readDay(c.get('db'));
    if (day === null || day.row.status === 'closed') return c.json({ tournament: null, upNext: [], pendingPairs: [] });
    return c.json({
      tournament: tournamentView(day.context, startedAtOf(day)),
      upNext: offersFor(day, c.req.query('courtId') ?? null),
      pendingPairs: pendingPairsOf(day),
    });
  });

  // ADR-089 — the participant Line-ups tab: every unresolved match, in play order.
  routes.get('/lineups', async (c) => {
    const viewer = requireViewer(c);
    const db = c.get('db');
    // ADR-321 — dumb mode has no line-ups at all, and the tab says so rather than listing fixtures.
    // ADR-336 — read through the mode, so every surface agrees about which game is on.
    const mode = await readOperatingMode(db);
    const dumb = await dumbDay(db);
    if (isAwarding(mode)) {
      return c.json({ tournament: null, items: [], viewerUpSoon: null, mode: 'dumb' });
    }
    const day = await readDay(db);
    if (day === null) {
      return c.json({ tournament: null, items: [], viewerUpSoon: null, mode: dumb !== null ? 'dumb' : 'matches' });
    }
    const isOver = day.row.status === 'closed';
    return c.json({
      tournament: tournamentView(day.context, startedAtOf(day)),
      items: isOver ? [] : lineupMatches(day.context.state).map((match) => fixtureView(day.context, match)),
      viewerUpSoon: isOver ? null : await viewerUpSoonFor(c.get('db'), { viewer, day }),
      mode: 'matches',
    });
  });
}

export function registerTournamentReads(routes: Hono<AppBindings>): void {
  registerCourtReads(routes);
  registerMatchReads(routes);
  registerScheduleReads(routes);
}
