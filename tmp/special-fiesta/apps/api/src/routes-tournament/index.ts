import { Hono } from 'hono';
import type { AppBindings } from '../lib/session.js';
import { registerMatchActions } from './actions.js';
import { registerDeskDay } from './desk-day.js';
import { registerDeskMatches } from './desk-matches.js';
import { registerDeskSetup } from './desk-setup.js';
import { registerDumbCourts } from './dumb.js';
import { registerModeRoutes } from './mode.js';
import { registerTournamentReads } from './reads.js';

/**
 * F22–F25, S21, S60 — the captain's ball tournament, rebuilt (ADR-277): the same paths and wire
 * shapes the kept participant, facilitator and hall-screen code calls, served by the engine. This
 * directory is the composition root: the only code that sees the core adapter, the scheduler
 * adapter and the app at once (ADR-272).
 */
export function tournamentRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  registerTournamentReads(routes);
  registerMatchActions(routes);
  registerDumbCourts(routes);
  registerModeRoutes(routes);
  return routes;
}

/**
 * ADR-279 — the superadmin's tournament console, mounted at `/api/admin/tournament`: setup (courts,
 * the draft and its entrants, Start), the day's matches (corrections, re-seats, hand-staged matches)
 * and the day itself (stages, awards, contingency, moves, terminate, close, and the reads).
 */
export function deskRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  registerDeskDay(routes);
  registerDeskSetup(routes);
  registerDeskMatches(routes);
  return routes;
}
