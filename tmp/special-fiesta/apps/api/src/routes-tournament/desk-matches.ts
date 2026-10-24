import type { Hono } from 'hono';
import {
  adminCancelMatchRequestSchema,
  correctResultRequestSchema,
  handBackRequestSchema,
  matchVoidRequestSchema,
  messages,
  reseatRequestSchema,
  stageAdHocRequestSchema,
  walkoverRequestSchema,
} from '@psd/contracts';
import type { MatchView } from '@psd/contracts';
import { callOff, cancelMatch, correctResult, recordWalkover, reseat, setMatchVoided, stageAdHocMatch } from '@psd/tournament/core';
import { required } from '../db/rows.js';
import { badRequest, notFound, readBody, requireParam } from '../lib/http.js';
import { pushLeaderboard } from '../lib/leaderboardPush.js';
import { requireSuperadmin, type AppBindings, type AppContext } from '../lib/session.js';
import { publishFeedMatch } from '../lib/statusBus.js';
import type { EngineCommand } from '../tournament/commands.js';
import { runBridged } from './bridge.js';
import { findScheduler } from '../tournament-scheduler/scheduler.js';
import { matchView } from '../views/tournament.js';
import { readConsole } from './desk.js';
import { refusalError } from './refusals.js';
import { engineActorOf, entrantOfTeam, readDay, withTournamentWrite } from './support.js';

/**
 * ADR-279 — requirement 4 and the desk's hand on the day's matches: correct a result, record a
 * walkover, void and unvoid, re-seat a seat, call a match off with a reason, stage one by hand. Each
 * is an engine command run as the superadmin, so each is an attributable event; each pushes what it
 * changed — the match to the feed and, when a result moved, the board (ADR-131).
 */

/** What a match staged at the desk is planned for when there is no scheduler to name a length. */
const AD_HOC_MINUTES = 12;

// ADR-346 — the write and its follow-through are one expression: the route cannot return
// between committing a match act and voiding the caches / re-planning the day.
async function run(c: AppContext, command: EngineCommand, follow: { isResult: boolean }) {
  const actor = engineActorOf(requireSuperadmin(c));
  return withTournamentWrite(c.get('db'), { now: new Date(), isResult: follow.isResult }, async () => {
    const outcome = await runBridged(c.get('db'), { actor, now: new Date(), command });
    if (!outcome.ok) throw refusalError(outcome.refusal);
    return outcome;
  });
}

/** After the write has been followed through: the match as the feed now shows it, if it does. */
async function settled(c: AppContext, input: { matchId: string }): Promise<MatchView | null> {
  const day = await readDay(c.get('db'));
  const match = day?.context.state.matches.find((row) => row.id === input.matchId);
  return day !== null && match !== undefined && match.status !== 'scheduled' ? matchView(day.context, match) : null;
}

async function consoleOf(c: AppContext) {
  return c.json(await readConsole(c.get('db'), new Date()));
}

async function teamEntrant(c: AppContext, teamId: string): Promise<string> {
  const day = await readDay(c.get('db'));
  const entrantId = day === null ? null : entrantOfTeam(day.context, teamId);
  if (entrantId === null) throw notFound(messages.teamNotInTournament);
  return entrantId;
}

function registerResults(routes: Hono<AppBindings>): void {
  // Requirement 4 — the whole result restated and re-paid; frozen dependents are flagged, never moved.
  routes.post('/matches/:matchId/result', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, correctResultRequestSchema);
    const matchId = requireParam(c, 'matchId');
    const command = {
      matchId,
      scoreA: body.scoreA,
      scoreB: body.scoreB,
      namedWinner: body.winnerSide,
      tiebreakMethod: body.tiebreakMethod,
      reason: body.reason,
    };
    await run(c, (state, context) => correctResult(state, command, context), { isResult: true });
    const view = await settled(c, { matchId });
    if (view !== null) publishFeedMatch(view);
    await pushLeaderboard(c.get('db'));
    return consoleOf(c);
  });

  routes.post('/matches/:matchId/walkover', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, walkoverRequestSchema);
    const matchId = requireParam(c, 'matchId');
    await run(c, (state, context) => recordWalkover(state, { matchId, winnerSide: body.winnerSide, reason: body.reason }, context), { isResult: true });
    const view = await settled(c, { matchId });
    if (view !== null) publishFeedMatch(view);
    await pushLeaderboard(c.get('db'));
    return consoleOf(c);
  });

  // F44 — reversible, explained, excluded from every table and every payment.
  routes.post('/matches/:matchId/void', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, matchVoidRequestSchema);
    const matchId = requireParam(c, 'matchId');
    await run(c, (state, context) => setMatchVoided(state, { matchId, isVoided: body.isVoided, reason: body.reason }, context), { isResult: true });
    const view = await settled(c, { matchId });
    if (view !== null) publishFeedMatch(view);
    await pushLeaderboard(c.get('db'));
    return consoleOf(c);
  });
}

function registerSeats(routes: Hono<AppBindings>): void {
  // The one way a seat already filled moves: by a person, with a reason. A scheduled match is not on the feed.
  routes.post('/matches/:matchId/reseat', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, reseatRequestSchema);
    const matchId = requireParam(c, 'matchId');
    const entrantId = await teamEntrant(c, body.teamId);
    await run(c, (state, context) => reseat(state, { matchId, side: body.side, entrantId, reason: body.reason }, context), { isResult: false });
    await settled(c, { matchId });
    return consoleOf(c);
  });

  routes.post('/matches/:matchId/cancel', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, adminCancelMatchRequestSchema);
    const matchId = requireParam(c, 'matchId');
    await run(c, (state, context) => cancelMatch(state, { matchId, reason: body.reason }, context), { isResult: false });
    const view = await settled(c, { matchId });
    if (view !== null) publishFeedMatch(view);
    return consoleOf(c);
  });

  // ADR-329 F4 — hand a live match back from the desk: a structure match returns to the
  // queue (still owed), so a facilitator whose phone died cannot strand a court. The
  // facilitator's own button is the same engine act (`callOff`, ADR-277).
  routes.post('/matches/:matchId/hand-back', async (c) => {
    requireSuperadmin(c);
    await readBody(c, handBackRequestSchema);
    const matchId = requireParam(c, 'matchId');
    await run(c, (state, context) => callOff(state, { matchId }, context), { isResult: false });
    const view = await settled(c, { matchId });
    if (view !== null) publishFeedMatch(view);
    return consoleOf(c);
  });

  // P-05 — any two teams, by hand; it counts exactly as much as one the scheduler planned.
  routes.post('/matches', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, stageAdHocRequestSchema);
    if (body.teamAId === body.teamBId) throw badRequest(messages.teamCannotPlayItself);
    const entrantAId = await teamEntrant(c, body.teamAId);
    const entrantBId = await teamEntrant(c, body.teamBId);
    const day = await readDay(c.get('db'));
    const scheduler = day === null ? null : await findScheduler(c.get('db'), day.row.id);
    const command = { courtId: body.courtId, entrantAId, entrantBId, plannedMinutes: scheduler?.matchMinutes ?? AD_HOC_MINUTES };
    const outcome = await run(c, (state, context) => stageAdHocMatch(state, command, context), { isResult: false });
    // An accepted stage writes exactly one new match.
    const staged = required(outcome.written.newMatches[0], 'staged match');
    const view = await settled(c, { matchId: staged.id });
    if (view !== null) publishFeedMatch(view);
    return consoleOf(c);
  });
}

export function registerDeskMatches(routes: Hono<AppBindings>): void {
  registerResults(routes);
  registerSeats(routes);
}
