import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { newId, newSessionToken } from '../ids.js';
import { sessions } from '../schema/index.js';
import type { SessionRow } from '../schema/index.js';
import { firstOrNull, firstOrThrow } from '../rows.js';

/**
 * ADR-004 — opaque server-side sessions. Active means "not signed out AND not past TTL";
 * sign-out is a soft delete (expires_at), never a DELETE (AGENTS-database.md §3).
 */

export interface NewSession {
  actorType: 'participant' | 'facilitator' | 'superadmin';
  actorId: string;
  ttlDays: number;
}

function actorColumns(input: NewSession): Pick<
  typeof sessions.$inferInsert,
  'participantId' | 'facilitatorId' | 'superadminId'
> {
  if (input.actorType === 'participant') return { participantId: input.actorId };
  if (input.actorType === 'facilitator') return { facilitatorId: input.actorId };
  return { superadminId: input.actorId };
}

function ttlDeadline(ttlDays: number): Date {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

export async function createSession(db: Executor, input: NewSession): Promise<SessionRow> {
  return firstOrThrow(await db
    .insert(sessions)
    .values({
      id: newId(),
      token: newSessionToken(),
      actorType: input.actorType,
      validUntil: ttlDeadline(input.ttlDays),
      ...actorColumns(input),
    })
    .returning(), 'Session insert returned no row');
}

export async function findActiveSession(db: Executor, token: string): Promise<SessionRow | null> {
  return firstOrNull(await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.token, token), isNull(sessions.expiresAt), gt(sessions.validUntil, new Date())),
    ));
}

/**
 * ADR-082 — kept purely as forensics ("when was this token last used", for incident
 * review): nothing functional reads it, and expiry is a fixed window (`validUntil`), not
 * sliding. Batched like the participant stamp; an empty interval costs no query.
 */
export async function touchSessionsSeen(db: Executor, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(inArray(sessions.id, [...ids]));
}

export async function invalidateSession(db: Executor, sessionId: string): Promise<void> {
  await db.update(sessions).set({ expiresAt: new Date() }).where(eq(sessions.id, sessionId));
}
