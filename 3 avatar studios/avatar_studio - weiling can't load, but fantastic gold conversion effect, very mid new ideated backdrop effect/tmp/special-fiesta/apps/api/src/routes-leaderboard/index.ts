import { Hono } from 'hono';
import { respondCached } from '../lib/http.js';
import { readLeaderboardView } from '../lib/leaderboardView.js';
import { requireViewer, type AppBindings } from '../lib/session.js';

/** F16/F49 — S5 cluster leaderboard with the top-10 individual scorers. */
export function leaderboardRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  /*
   * ADR-135 (C1) — the heaviest poll in the app, answered conditionally. Three hundred phones
   * re-download an identical board all afternoon; it changes a few dozen times.
   */
  routes.get('/', async (c) => {
    // ADR-140 — the hall screen reads this too; it is the same board for everybody.
    requireViewer(c);
    return respondCached(c, await readLeaderboardView(c.get('db')));
  });

  return routes;
}
