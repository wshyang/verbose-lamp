import { eq } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { newId } from '../ids.js';
import { serviceStates, superadminAccounts } from '../schema/index.js';
import type { ServiceStateRow } from '../schema/index.js';
import { firstOrNull } from '../rows.js';
import { SERVICE_STATE_TAG, cachedRead, invalidateTag } from '../../lib/cache.js';

/**
 * ADR-118 #obj-servicestate — the day's operations switch.
 *
 * Singleton, like `point_config`, but with the opposite meaning for an absent row: no row
 * means **full service**. A pause is a deliberate act that leaves a record of who did it;
 * silence is not a configuration anyone has to perform before the event can run.
 */

export interface ServiceStateRecord extends ServiceStateRow {
  updatedByUsername: string;
}

/** Full service, which is what an un-paused event looks like before anyone touches the switch. */
export const FULL_SERVICE = {
  isSocialPaused: false,
  updatedAt: null,
  updatedByUsername: null,
  /**
   * ADR-147 — off, and off is the state a database nobody has configured must be in. A
   * service worker is the one thing in this app that outlives the page that installed it,
   * so it may only ever exist because somebody said so.
   */
  isStationOfflineEnabled: false,
  stationOfflineUpdatedAt: null,
} as const;

export async function findServiceState(db: Executor): Promise<ServiceStateRecord | null> {
  return firstOrNull(
    await db
      .select({
        id: serviceStates.id,
        singleton: serviceStates.singleton,
        isSocialPaused: serviceStates.isSocialPaused,
        isStationOfflineEnabled: serviceStates.isStationOfflineEnabled,
        stationOfflineUpdatedAt: serviceStates.stationOfflineUpdatedAt,
        updatedAt: serviceStates.updatedAt,
        updatedBySuperadminId: serviceStates.updatedBySuperadminId,
        updatedByUsername: superadminAccounts.username,
      })
      .from(serviceStates)
      .innerJoin(
        superadminAccounts,
        eq(superadminAccounts.id, serviceStates.updatedBySuperadminId),
      ),
  );
}

/**
 * The guard asks this on every social request. It is NOT memoised in module state, because a
 * stale `false` would keep three hundred phones streaming after an operator pressed pause — the
 * one moment the switch exists for. It is memoised through the tag system instead (ADR-324):
 * every write to the row voids `SERVICE_STATE_TAG` before it returns, so the next request reads
 * the new value, and the one-second TTL only bounds a void somebody forgets to call.
 */
const SOCIAL_PAUSE_TTL_MS = 1_000;

async function socialPausedFromDb(db: Executor): Promise<boolean> {
  const state = await findServiceState(db);
  return state?.isSocialPaused ?? FULL_SERVICE.isSocialPaused;
}

export const isSocialPaused = cachedRead(socialPausedFromDb, {
  name: 'serviceState.socialPaused',
  ttlMs: SOCIAL_PAUSE_TTL_MS,
  tags: [SERVICE_STATE_TAG],
});

/**
 * ADR-147 — read by the public app-shell-policy route, which a facilitator's phone polls
 * while it is open. Same reasoning as `isSocialPaused`: never cached in module state, because
 * a stale `true` here is a worker that will not retire on the one afternoon somebody needs it
 * gone.
 */
export async function isStationOfflineEnabled(db: Executor): Promise<boolean> {
  const state = await findServiceState(db);
  return state?.isStationOfflineEnabled ?? FULL_SERVICE.isStationOfflineEnabled;
}

/**
 * The row is a singleton shared with the social pause, so a toggle must preserve whatever the
 * pause currently says — and must NOT touch `updated_at`/`updated_by`, which are the pause's
 * attribution and are shown to an operator as "paused by". Two switches, one row, separate
 * stories about who last moved them.
 */
async function writeStationOffline(
  db: Executor,
  input: { superadminId: string; enabled: boolean },
): Promise<ServiceStateRecord> {
  const existing = await findServiceState(db);
  const values = {
    isStationOfflineEnabled: input.enabled,
    stationOfflineUpdatedAt: new Date(),
  };
  if (existing) {
    await db.update(serviceStates).set(values).where(eq(serviceStates.id, existing.id));
  } else {
    await db.insert(serviceStates).values({
      id: newId(),
      ...values,
      updatedBySuperadminId: input.superadminId,
    });
  }
  // ADR-324 — the same row, so the same memo.
  invalidateTag(SERVICE_STATE_TAG);
  const written = await findServiceState(db);
  if (!written) throw new Error('Service state read-back found nothing');
  return written;
}

/** Named pairs rather than one boolean parameter, for the reason given below. */
export async function enableStationOffline(
  db: Executor,
  superadminId: string,
): Promise<ServiceStateRecord> {
  return writeStationOffline(db, { superadminId, enabled: true });
}

export async function disableStationOffline(
  db: Executor,
  superadminId: string,
): Promise<ServiceStateRecord> {
  return writeStationOffline(db, { superadminId, enabled: false });
}

async function writeSocialPause(
  db: Executor,
  input: { superadminId: string; paused: boolean },
): Promise<ServiceStateRecord> {
  const existing = await findServiceState(db);
  const values = {
    isSocialPaused: input.paused,
    updatedAt: new Date(),
    updatedBySuperadminId: input.superadminId,
  };
  if (existing) {
    await db.update(serviceStates).set(values).where(eq(serviceStates.id, existing.id));
  } else {
    await db.insert(serviceStates).values({ id: newId(), ...values });
  }
  // ADR-324 — void the memo before anyone can ask again, so a pause lands on the next request.
  invalidateTag(SERVICE_STATE_TAG);
  const written = await findServiceState(db);
  if (!written) throw new Error('Service state read-back found nothing');
  return written;
}

/**
 * Two named functions rather than one taking a boolean: a flag argument at the call site
 * reads as `setSocialPaused(db, id, false)`, which says nothing about intent at a glance
 * (AGENTS-function-design.md §3).
 */
export async function pauseSocial(db: Executor, superadminId: string): Promise<ServiceStateRecord> {
  return writeSocialPause(db, { superadminId, paused: true });
}

export async function resumeSocial(
  db: Executor,
  superadminId: string,
): Promise<ServiceStateRecord> {
  return writeSocialPause(db, { superadminId, paused: false });
}
