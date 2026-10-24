import type { LeaderboardView } from '@psd/contracts';
import type { AppDatabase } from '../db/client.js';
import { readClusterStandings, readTopIndividuals } from '../db/entities/index.js';
import { clusterStandingView, individualStandingView } from '../views/admin.js';
import { SCOREBOARD_TAG, cachedRead } from './cache.js';

/**
 * ADR-135 — the board as one value, built in one place.
 *
 * It existed twice: the HTTP route assembled it and `pushLeaderboard` assembled it again, each
 * stamping its own `new Date()`. ADR-131 ruled that a push should carry the same object the
 * response returns; that was true of the shape and not of the bytes, and two assemblies of one
 * fact drift (ADR-131 again, ADR-133 one endpoint over).
 *
 * **`generatedAt` is computed inside the memo, which is what makes the surface ETag-able.**
 * Stamped at serialisation it moved on every single request, so a hash of the body would never
 * have matched twice and C1 would have shipped doing visibly nothing — the exact failure the
 * byte-stability assertion exists to catch. Inside, it stops meaning "when this JSON was
 * written" and starts meaning "when these standings were computed", which is both the honest
 * reading and the one ADR-132's `generatedAt` comparison actually wants.
 *
 * It still moves forward whenever it must: every write that can change a standing voids
 * `SCOREBOARD_TAG`, so the next read is a fresh computation with a fresh stamp. The only time
 * it moves without the board changing is the TTL expiring under an idle event, which costs one
 * re-download an afternoon.
 */
async function buildLeaderboardView(db: AppDatabase): Promise<LeaderboardView> {
  const [clusters, individuals] = await Promise.all([
    readClusterStandings(db),
    readTopIndividuals(db),
  ]);
  return {
    clusters: clusters.map(clusterStandingView),
    topIndividuals: individuals.map(individualStandingView),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * The outer memo over two inner ones. That is not redundant: the inner entries shield the
 * database, and this one makes the *composition* — including its timestamp — identical between
 * two readers and between a reader and a subscriber. Same tag, so one write voids all three.
 */
export const readLeaderboardView = cachedRead(buildLeaderboardView, {
  name: 'leaderboard.view',
  ttlMs: 5_000,
  swrMs: 25_000,
  tags: [SCOREBOARD_TAG],
});
