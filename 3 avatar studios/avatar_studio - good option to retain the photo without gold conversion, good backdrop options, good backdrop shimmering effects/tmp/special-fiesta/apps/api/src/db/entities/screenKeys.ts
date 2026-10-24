import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { ScreenSceneId } from '@psd/contracts';
import type { Executor } from '../client.js';
import { newId, newSessionToken } from '../ids.js';
import { screenKeys } from '../schema/index.js';
import type { ScreenKeyRow } from '../schema/index.js';
import { firstOrNull, firstOrThrow } from '../rows.js';

/**
 * ADR-140 — the hall screen's key: created by a superadmin, revoked by a superadmin, never
 * expiring on its own.
 *
 * A session's TTL protects a person's account from a borrowed phone. A projector key protects
 * nothing by expiring — it would simply go dark mid-event, which is the exact failure the key
 * exists to avoid. So the only way it stops working is somebody deciding it should, and that
 * decision is a soft delete so the record of what was projecting survives it.
 */

export async function createScreenKey(
  db: Executor,
  input: { label: string; superadminId: string; enabledScenes: readonly ScreenSceneId[] },
): Promise<ScreenKeyRow> {
  return firstOrThrow(
    await db
      .insert(screenKeys)
      .values({
        id: newId(),
        label: input.label,
        // The same 256-bit opaque shape as a session token (ADR-004): a key that appears in a
        // URL on a laptop in a public hall has no business being guessable.
        token: newSessionToken(),
        createdBy: input.superadminId,
        enabledScenes: [...input.enabledScenes],
      })
      .returning(),
    'Screen key insert returned no row',
  );
}

export async function findActiveScreenKey(db: Executor, token: string): Promise<ScreenKeyRow | null> {
  return firstOrNull(
    await db
      .select()
      .from(screenKeys)
      .where(and(eq(screenKeys.token, token), isNull(screenKeys.expiresAt))),
  );
}

/** Newest first, revoked ones included — a revoked key is still part of the answer. */
export async function listScreenKeys(db: Executor): Promise<ScreenKeyRow[]> {
  return db.select().from(screenKeys).orderBy(desc(screenKeys.createdAt));
}

/**
 * ADR-145 — "which key is the hall actually using?", batched exactly like the session stamp
 * (ADR-082): one statement per flush interval, never a write on the request path.
 *
 * Until this existed the column was set at creation and never touched again, so the console
 * would have reported a projector as last seen at the moment somebody minted its key — most
 * confidently wrong for the key that was never used at all. It is read before a revoke, which
 * makes a lie here the difference between retiring a spare and blanking the hall.
 */
export async function touchScreenKeysSeen(db: Executor, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.update(screenKeys).set({ lastSeenAt: new Date() }).where(inArray(screenKeys.id, [...ids]));
}

/**
 * Idempotent by its WHERE: revoking an already-revoked key matches nothing and returns null,
 * which the route reads as "nothing to do" rather than as an error. Two superadmins reaching
 * for the same switch at the same moment is the normal case, not the exceptional one.
 */
export async function invalidateScreenKey(db: Executor, id: string): Promise<ScreenKeyRow | null> {
  return firstOrNull(
    await db
      .update(screenKeys)
      .set({ expiresAt: new Date() })
      .where(and(eq(screenKeys.id, id), isNull(screenKeys.expiresAt)))
      .returning(),
  );
}

/**
 * ADR-160 — which scenes this screen may show, changed after the fact.
 *
 * Scoped to a LIVE key (`expires_at IS NULL`) for the same reason the revoke is: a revoked
 * key is a historical record of what was projecting, and editing one would quietly rewrite
 * the answer to an audit question. Null therefore means "no live key by that id", which the
 * route reads as a 404 whether the key never existed or was retired a minute ago.
 *
 * The name is deliberately NOT editable. A key's label is its identity in the revoke list
 * and in `last_seen_at` troubleshooting, and the organiser chose to keep that fixed: a
 * projector that moves rooms gets a new key, so "what was projecting in the hall that day"
 * keeps a stable answer.
 */
export async function setScreenKeyScenes(
  db: Executor,
  input: { id: string; enabledScenes: readonly ScreenSceneId[] },
): Promise<ScreenKeyRow | null> {
  return firstOrNull(
    await db
      .update(screenKeys)
      .set({ enabledScenes: [...input.enabledScenes] })
      .where(and(eq(screenKeys.id, input.id), isNull(screenKeys.expiresAt)))
      .returning(),
  );
}
