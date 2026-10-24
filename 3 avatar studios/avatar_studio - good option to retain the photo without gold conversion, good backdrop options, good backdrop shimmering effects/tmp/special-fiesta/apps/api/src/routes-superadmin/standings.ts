import { Hono } from 'hono';
import { readFinalStandings } from '../lib/finalStandings.js';
import { requireSuperadmin, type AppBindings } from '../lib/session.js';

/**
 * ADR-161 — the one read that lets the day's result leave the building.
 *
 * Deliberately a single JSON read rather than three CSV endpoints: the console builds the
 * files from exactly the object it is displaying, so a downloaded spreadsheet and the sheet
 * on screen cannot drift apart between one request and the next.
 */
export function superadminStandingsRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.get('/standings/final', async (c) => {
    requireSuperadmin(c);
    return c.json({ standings: await readFinalStandings(c.get('db')) });
  });

  return routes;
}
