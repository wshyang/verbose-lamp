import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AppDatabase, Executor } from '../client.js';
import { newId } from '../ids.js';
import { facilitatorAccounts, fringeRounds } from '../schema/index.js';
import type { FringeRoundRow } from '../schema/index.js';
import { firstOrDefault, firstOrNull, firstOrThrow } from '../rows.js';

/** fds.md §2.8 #obj-fringeround, §3.3 #state-round. */

export interface RoundRecord extends FringeRoundRow {
  openedByUsername: string;
  scanCount: number;
}

function roundQuery(db: Executor) {
  return db
    .select({
      id: fringeRounds.id,
      activityId: fringeRounds.activityId,
      roundNumber: fringeRounds.roundNumber,
      status: fringeRounds.status,
      openedAt: fringeRounds.openedAt,
      closedAt: fringeRounds.closedAt,
      openedByFacilitatorId: fringeRounds.openedByFacilitatorId,
      openedByUsername: facilitatorAccounts.username,
      scanCount: sql<number>`(
        SELECT count(*)::int FROM fringe_scan s
        WHERE s.round_id = ${fringeRounds.id} AND s.is_voided = false
      )`,
    })
    .from(fringeRounds)
    .innerJoin(facilitatorAccounts, eq(facilitatorAccounts.id, fringeRounds.openedByFacilitatorId));
}

export async function findRoundById(db: Executor, roundId: string): Promise<RoundRecord | null> {
  return firstOrNull(await roundQuery(db).where(eq(fringeRounds.id, roundId)));
}

/** Re-read of a round this request just wrote: its absence is a broken invariant, not a 404. */
export async function requireRoundRecord(db: Executor, roundId: string): Promise<RoundRecord> {
  return firstOrThrow(await roundQuery(db).where(eq(fringeRounds.id, roundId)), 'Round');
}

/** §3.3 — at most one round per activity is open or ended, so this returns at most one row. */
export async function findCurrentRound(
  db: Executor,
  activityId: string,
): Promise<RoundRecord | null> {
  return firstOrNull(await roundQuery(db).where(
    and(eq(fringeRounds.activityId, activityId), inArray(fringeRounds.status, ['open', 'ended'])),
  ));
}

async function nextRoundNumber(tx: Executor, activityId: string): Promise<number> {
  const rows = await tx
    .select({ highest: sql<number>`coalesce(max(${fringeRounds.roundNumber}), 0)::int` })
    .from(fringeRounds)
    .where(eq(fringeRounds.activityId, activityId));
  return firstOrDefault(rows, { highest: 0 }).highest + 1;
}

export interface OpenRoundInput {
  activityId: string;
  facilitatorId: string;
}

/** F26 — open the first round (or the next one after a close). */
export async function openRound(db: AppDatabase, input: OpenRoundInput): Promise<FringeRoundRow> {
  return db.transaction(async (tx) => {
    const roundNumber = await nextRoundNumber(tx, input.activityId);
    return firstOrThrow(
      await tx
        .insert(fringeRounds)
        .values({
          id: newId(),
          activityId: input.activityId,
          roundNumber,
          status: 'open',
          openedByFacilitatorId: input.facilitatorId,
        })
        .returning(),
      'Round insert returned no row',
    );
  });
}

export interface AdvanceRoundInput {
  round: FringeRoundRow;
  facilitatorId: string;
}

/** F28 — atomic close of round N plus open of round N+1 (fds.md §7.8). */
export async function advanceRound(
  db: AppDatabase,
  input: AdvanceRoundInput,
): Promise<FringeRoundRow> {
  return db.transaction(async (tx) => {
    await tx
      .update(fringeRounds)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(fringeRounds.id, input.round.id));
    return firstOrThrow(await tx
      .insert(fringeRounds)
      .values({
        id: newId(),
        activityId: input.round.activityId,
        roundNumber: input.round.roundNumber + 1,
        status: 'open',
        openedByFacilitatorId: input.facilitatorId,
      })
      .returning(), 'Advanced round insert returned no row');
  });
}

/** F29 — end for the day. Reversible by design (DC-003). */
export async function endRound(db: Executor, roundId: string): Promise<FringeRoundRow | null> {
  return firstOrNull(await db
    .update(fringeRounds)
    .set({ status: 'ended' })
    .where(and(eq(fringeRounds.id, roundId), eq(fringeRounds.status, 'open')))
    .returning());
}

/** F30 — reactivate keeps the same round_number (fds.md §7.8). */
export async function reactivateRound(db: Executor, roundId: string): Promise<FringeRoundRow | null> {
  return firstOrNull(await db
    .update(fringeRounds)
    .set({ status: 'open' })
    .where(and(eq(fringeRounds.id, roundId), eq(fringeRounds.status, 'ended')))
    .returning());
}
