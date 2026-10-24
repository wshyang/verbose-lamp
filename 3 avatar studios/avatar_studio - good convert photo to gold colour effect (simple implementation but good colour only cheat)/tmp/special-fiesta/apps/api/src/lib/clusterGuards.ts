import { messages } from '@psd/contracts';
import { findClusterByCode, hasScoringStarted } from '../db/entities/index.js';
import { badRequest, conflict } from './http.js';
import type { AppContext } from './session.js';

/**
 * ADR-172 — the checks the editable cluster catalogue made necessary.
 *
 * They live in `lib/` rather than beside the superadmin routes because signup needs the first
 * one and the superadmin console needs both, and a guard imported across route modules is a
 * dependency pointing the wrong way.
 */

/**
 * Is this a cluster somebody may join right now?
 *
 * Shape is all `clusterCodeSchema` can promise since the catalogue stopped being a `z.enum`, so
 * existence and openness are asked here. Without it an invented code reaches the foreign key
 * and surfaces as a 500, and a retired code would still be accepted.
 */
export async function assertClusterUsable(c: AppContext, code: string): Promise<void> {
  const cluster = await findClusterByCode(c.get('db'), code);
  if (!cluster) throw badRequest(messages.clusterRequired, 'clusterCode');
  if (cluster.retiredAt) throw badRequest(messages.clusterRetired, 'clusterCode');
}

/**
 * The freeze, for the two operations that can move a point.
 *
 * It asks the database instead of reading a flag, because "scoring has started" is a fact about
 * scans and matches; a flag would be a second place for it to be true and a second place to get
 * it wrong.
 */
/**
 * Does this cluster exist at all?
 *
 * Weaker than `assertClusterUsable` on purpose: the nickname finder may legitimately be asked
 * about a retired cluster, and the honest answer there is an empty list rather than an error.
 * What it must still refuse is a code that was never a cluster — which `clusterCodeSchema`
 * caught for free while it was a `z.enum`, and cannot now.
 */
export async function assertClusterExists(c: AppContext, code: string): Promise<void> {
  const cluster = await findClusterByCode(c.get('db'), code);
  if (!cluster) throw badRequest(messages.clusterRequired, 'clusterCode');
}

export async function assertCatalogueUnlocked(c: AppContext): Promise<void> {
  if (await hasScoringStarted(c.get('db'))) {
    throw conflict(messages.clusterLockedByScoring);
  }
}
