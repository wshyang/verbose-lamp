import {
  createClusterRequestSchema,
  messages,
  reassignClusterRequestSchema,
  renameClusterRequestSchema,
} from '@psd/contracts';
import { Hono } from 'hono';
import {
  createCluster,
  findClusterByCode,
  findClusterByCodeInsensitive,
  hasScoringStarted,
  listClusters,
  reassignClusterMembers,
  renameCluster,
  restoreCluster,
  retireCluster,
} from '../db/entities/index.js';
import { CLUSTER_TAG, SCOREBOARD_TAG, invalidateTag } from '../lib/cache.js';
import { assertCatalogueUnlocked } from '../lib/clusterGuards.js';
import { badRequest, conflict, notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings, type AppContext } from '../lib/session.js';
import { clusterView } from './views.js';

/**
 * ADR-172 — S44 the cluster catalogue.
 *
 * Four rules, and the two interesting ones are about damage that is invisible at the moment it
 * is done:
 *
 *   1. **No delete, only retire.** `chat_message.cluster_code_snapshot` and
 *      `gallery_photo.cluster_code_snapshot` hold the code permanently, so a delete would either
 *      be refused by the foreign key or have to blank somebody's history. There is no DELETE
 *      route in this file on purpose.
 *   2. **Retiring is refused while anyone is still in it.** The request asked for this directly,
 *      and the guard below is the whole of it: move the people first.
 *   3. **Retiring and reassigning stop once scoring starts.** The leaderboard groups live on
 *      `participant.cluster_code`, so moving somebody moves every point they have already
 *      earned, retroactively, on a board that is on the wall. fds.md §9 made the catalogue
 *      immutable for exactly this reason; this is that protection kept where it bites.
 *   4. **Adding and renaming are never frozen.** Neither can move a point: a new cluster starts
 *      at zero, and a rename changes a label while the code every table references stays put. A
 *      cluster that turns up on the morning of the event is a real thing that happens, and
 *      refusing it would protect nothing.
 */
export function superadminClusterRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  registerCatalogueReads(routes);
  registerCatalogueEdits(routes);
  registerRetirement(routes);
  return routes;
}

/** Always available: neither reading nor adding can move a point (rule 4). */
function registerCatalogueReads(routes: Hono<AppBindings>): void {
  routes.get('/clusters', async (c) => {
    requireSuperadmin(c);
    const [items, scoringStarted] = await Promise.all([
      listClusters(c.get('db')),
      hasScoringStarted(c.get('db')),
    ]);
    // The console needs the lock's state, not just its consequences, or it can only explain a
    // refusal after the superadmin has already been refused.
    return c.json({ items: items.map(clusterView), scoringStarted });
  });

}

function registerCatalogueEdits(routes: Hono<AppBindings>): void {
  routes.post('/clusters', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, createClusterRequestSchema);
    const taken = await findClusterByCodeInsensitive(c.get('db'), body.code);
    if (taken) throw conflict(messages.clusterCodeTaken, 'code');
    const created = await createCluster(c.get('db'), body);
    forgetCatalogue();
    return c.json({ cluster: clusterView({ ...created, memberCount: 0 }) }, 201);
  });

  routes.put('/clusters/:code', async (c) => {
    requireSuperadmin(c);
    const code = requireParam(c, 'code');
    const body = await readBody(c, renameClusterRequestSchema);
    await loadCluster(c, code);
    await renameCluster(c.get('db'), code, body.displayName);
    forgetCatalogue();
    return c.json({ cluster: clusterView(await loadCluster(c, code)) });
  });

}

/** The locked half: retiring, restoring, and emptying a cluster so it can be retired. */
function registerRetirement(routes: Hono<AppBindings>): void {
  routes.post('/clusters/:code/retire', async (c) => {
    requireSuperadmin(c);
    const code = requireParam(c, 'code');
    const cluster = await loadCluster(c, code);
    await assertCatalogueUnlocked(c);
    if (cluster.memberCount > 0) throw badRequest(messages.clusterHasMembers);
    await retireCluster(c.get('db'), code);
    forgetCatalogue();
    return c.json({ cluster: clusterView(await loadCluster(c, code)) });
  });

  routes.post('/clusters/:code/restore', async (c) => {
    requireSuperadmin(c);
    const code = requireParam(c, 'code');
    await loadCluster(c, code);
    // Un-retiring is always allowed: it can only put a choice back, never move a point.
    await restoreCluster(c.get('db'), code);
    forgetCatalogue();
    return c.json({ cluster: clusterView(await loadCluster(c, code)) });
  });

  /** Empties a cluster in one move, so it can then be retired. */
  routes.post('/clusters/:code/reassign', async (c) => {
    requireSuperadmin(c);
    const code = requireParam(c, 'code');
    const body = await readBody(c, reassignClusterRequestSchema);
    await loadCluster(c, code);
    if (body.toClusterCode === code) throw badRequest(messages.clusterSameTarget, 'toClusterCode');
    const target = await loadCluster(c, body.toClusterCode);
    if (target.retiredAt) throw badRequest(messages.clusterRetired, 'toClusterCode');
    await assertCatalogueUnlocked(c);

    const moved = await reassignClusterMembers(c.get('db'), code, body.toClusterCode);
    forgetCatalogue();
    // Their points move with them, so every standing is now wrong until it is recomputed.
    invalidateTag(SCOREBOARD_TAG);
    return c.json({ moved, cluster: clusterView(await loadCluster(c, code)) });
  });
}

async function loadCluster(c: AppContext, code: string) {
  const cluster = await findClusterByCode(c.get('db'), code);
  if (!cluster) throw notFound(messages.clusterNotFound);
  return cluster;
}


/** ADR-038 caches the signup catalogue for a minute; an edit must not wait that minute out. */
function forgetCatalogue(): void {
  invalidateTag(CLUSTER_TAG);
}

