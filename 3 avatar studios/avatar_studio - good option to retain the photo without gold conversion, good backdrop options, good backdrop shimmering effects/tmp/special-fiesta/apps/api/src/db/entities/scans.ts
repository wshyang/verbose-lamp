import { and, desc, eq, not, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { SCOREBOARD_TAG, invalidateTag } from '../../lib/cache.js';
import { newId } from '../ids.js';
import { fringeScans, participants } from '../schema/index.js';
import type { FringeScanRow } from '../schema/index.js';
import { firstOrDefault, firstOrNull, firstOrThrow, required } from '../rows.js';

/** fds.md §2.9 #obj-fringescan — immutable except the void flag; every value is snapshotted. */

export interface ScanRecord extends FringeScanRow {
  participantNickname: string;
  clusterCode: string;
}

function scanQuery(db: Executor) {
  return db
    .select({
      id: fringeScans.id,
      participantId: fringeScans.participantId,
      participantNickname: participants.nickname,
      clusterCode: participants.clusterCode,
      roundId: fringeScans.roundId,
      activityId: fringeScans.activityId,
      facilitatorId: fringeScans.facilitatorId,
      activityNameSnapshot: fringeScans.activityNameSnapshot,
      roundNumberSnapshot: fringeScans.roundNumberSnapshot,
      pointsAwardedSnapshot: fringeScans.pointsAwardedSnapshot,
      tierLabelSnapshot: fringeScans.tierLabelSnapshot,
      facilitatorUsernameSnapshot: fringeScans.facilitatorUsernameSnapshot,
      clientScanUuid: fringeScans.clientScanUuid,
      clientTimestamp: fringeScans.clientTimestamp,
      scannedAt: fringeScans.scannedAt,
      isVoided: fringeScans.isVoided,
      // ADR-138 — the station's own undo, told apart from a superadmin's void.
      undoneAt: fringeScans.undoneAt,
    })
    .from(fringeScans)
    .innerJoin(participants, eq(participants.id, fringeScans.participantId));
}

export interface NewScan {
  participantId: string;
  roundId: string;
  activityId: string;
  facilitatorId: string;
  activityNameSnapshot: string;
  roundNumberSnapshot: number;
  pointsAwardedSnapshot: number;
  tierLabelSnapshot: string;
  facilitatorUsernameSnapshot: string;
  clientScanUuid: string;
  clientTimestamp: Date;
}

/**
 * ADR-116 — three distinguishable endings, where there used to be two.
 *
 *  - `created`  the award is new.
 *  - `retry`    the same client_scan_uuid arrived twice. Still idempotent, still a 200: the
 *               offline queue (ADR-009) leans on this and must keep leaning on it.
 *  - `conflict` a *different* scan already holds this participant's slot in this round. This
 *               used to be folded into `retry` and answered 200, which silently discarded the
 *               second award — scan someone for turning up, then try to award them first
 *               place, and the placing vanished with a success response.
 */
export type ScanWriteResult =
  | { outcome: 'created'; scan: FringeScanRow }
  | { outcome: 'retry'; scan: FringeScanRow }
  | { outcome: 'conflict'; scan: FringeScanRow };

/**
 * ADR-009 / fds.md §4.2.11 — idempotent on the client's key, honest about everything else.
 */
export async function createScan(db: Executor, input: NewScan): Promise<ScanWriteResult> {
  const replayed = await findByClientUuid(db, input.clientScanUuid);
  if (replayed) return { outcome: 'retry', scan: replayed };
  const held = await findLiveSlotScan(db, input);
  if (held) return { outcome: 'conflict', scan: held };
  const inserted = await db
    .insert(fringeScans)
    .values({ id: newId(), ...input })
    .onConflictDoNothing()
    .returning();
  const written = inserted[0];
  if (!written) return resolveLostRace(db, input);
  // ADR-038 — a new award changes every standing; a duplicate changed nothing.
  invalidateTag(SCOREBOARD_TAG);
  return { outcome: 'created', scan: written };
}

/**
 * ADR-116 — replace the award holding this round's slot. The old scan is voided rather than
 * deleted, so the correction stays on the record and the leaderboard drops it by the same
 * `is_voided` filter it already applies. Both writes share a transaction: a void that lands
 * without its replacement would silently cost the participant their points.
 */
export async function replaceScan(
  db: Executor,
  input: NewScan & { replacedScanId: string },
): Promise<ScanWriteResult> {
  const { replacedScanId, ...scan } = input;
  const written = await db.transaction(async (tx) => {
    await tx.update(fringeScans).set({ isVoided: true }).where(eq(fringeScans.id, replacedScanId));
    return firstOrThrow(
      await tx
        .insert(fringeScans)
        .values({ id: newId(), ...scan })
        .returning(),
      'Replacement scan returned no row',
    );
  });
  invalidateTag(SCOREBOARD_TAG);
  return { outcome: 'created', scan: written };
}

async function findByClientUuid(db: Executor, clientScanUuid: string) {
  return firstOrNull(
    await db.select().from(fringeScans).where(eq(fringeScans.clientScanUuid, clientScanUuid)),
  );
}

/**
 * The live holder of this participant's slot in this round. Voided scans are skipped, matching
 * `ux_fringe_scan_live_slot`: voiding frees the slot, which is what makes a re-award possible.
 */
async function findLiveSlotScan(db: Executor, input: NewScan) {
  return firstOrNull(
    await db
      .select()
      .from(fringeScans)
      .where(
        and(
          eq(fringeScans.participantId, input.participantId),
          eq(fringeScans.roundId, input.roundId),
          not(fringeScans.isVoided),
        ),
      ),
  );
}

/** The insert lost a race with the index, so the row that beat it is there to read. */
async function resolveLostRace(db: Executor, input: NewScan): Promise<ScanWriteResult> {
  const byUuid = await findByClientUuid(db, input.clientScanUuid);
  if (byUuid) return { outcome: 'retry', scan: byUuid };
  return {
    outcome: 'conflict',
    scan: required(await findLiveSlotScan(db, input), 'Conflicting scan'),
  };
}

export async function findScanById(db: Executor, scanId: string): Promise<ScanRecord | null> {
  return firstOrNull(await scanQuery(db).where(eq(fringeScans.id, scanId)));
}

/** Re-read of a scan this request just wrote: its absence is a broken invariant, not a 404. */
export async function requireScanRecord(db: Executor, scanId: string): Promise<ScanRecord> {
  return firstOrThrow(await scanQuery(db).where(eq(fringeScans.id, scanId)), 'Scan');
}

export async function listScansForRound(db: Executor, roundId: string): Promise<ScanRecord[]> {
  return scanQuery(db).where(eq(fringeScans.roundId, roundId)).orderBy(desc(fringeScans.scannedAt));
}

export async function listScansForParticipant(
  db: Executor,
  participantId: string,
): Promise<ScanRecord[]> {
  return scanQuery(db)
    .where(eq(fringeScans.participantId, participantId))
    .orderBy(desc(fringeScans.scannedAt));
}

/**
 * ADR-239 — the stations this participant holds a counted scan at, and how many. Voided and
 * undone scans are both off the board (ADR-176), so neither completes a station nor adds a
 * strike to it. ADR-261 — the answer is a count per station, not a set of ids: two rounds at
 * one station are one station on a passport, and two chops on it.
 */
export async function listPassportCompletionCounts(
  db: Executor,
  participantId: string,
): Promise<ReadonlyMap<string, number>> {
  const rows = await db
    .select({ activityId: fringeScans.activityId, completions: sql<number>`count(*)::int` })
    .from(fringeScans)
    .where(and(eq(fringeScans.participantId, participantId), not(fringeScans.isVoided)))
    .groupBy(fringeScans.activityId);
  return new Map(rows.map((row) => [row.activityId, row.completions]));
}

export interface ScanFilters {
  activityId?: string | undefined;
  participantId?: string | undefined;
  roundId?: string | undefined;
}

/** S50 — superadmin list, filterable. */
export async function listScans(db: Executor, filters: ScanFilters = {}): Promise<ScanRecord[]> {
  const conditions = [
    filters.activityId ? eq(fringeScans.activityId, filters.activityId) : undefined,
    filters.participantId ? eq(fringeScans.participantId, filters.participantId) : undefined,
    filters.roundId ? eq(fringeScans.roundId, filters.roundId) : undefined,
  ].filter(Boolean);
  const query = scanQuery(db).orderBy(desc(fringeScans.scannedAt));
  return query.where(and(...conditions));
}

export async function setScanVoided(
  db: Executor,
  input: { scanId: string; isVoided: boolean },
): Promise<FringeScanRow | null> {
  const row = firstOrNull(await db
    .update(fringeScans)
    .set({ isVoided: input.isVoided })
    .where(eq(fringeScans.id, input.scanId))
    .returning());
  // ADR-038 — void/unvoid must show on the very next leaderboard read (fds.md F44).
  if (row !== null) invalidateTag(SCOREBOARD_TAG);
  return row;
}

/**
 * ADR-138 (F1) — the station's own ten-second undo, enforced entirely in this statement.
 *
 * Every condition is part of the WHERE clause on purpose. A read-then-write would decide
 * against a row it had already let go of: two taps of the same button, or a superadmin voiding
 * the scan in the same second, and the second writer overwrites a decision it never saw. Here
 * the database makes the decision once — the update either matches a scan that is this
 * facilitator's, still live, and still inside the window, or it matches nothing and the caller
 * learns it was refused by getting null back.
 *
 * `now() - scanned_at` uses the SERVER clock on both sides. The facilitator's countdown is
 * decoration; a phone whose clock is wrong, or a page left open for a minute, changes what the
 * button looks like and nothing about what is allowed.
 */
export async function undoScanAtStation(
  db: Executor,
  input: { scanId: string; facilitatorId: string; windowSeconds: number },
): Promise<FringeScanRow | null> {
  const row = firstOrNull(
    await db
      .update(fringeScans)
      .set({ isVoided: true, undoneAt: new Date() })
      .where(
        and(
          eq(fringeScans.id, input.scanId),
          eq(fringeScans.facilitatorId, input.facilitatorId),
          not(fringeScans.isVoided),
          sql`now() - ${fringeScans.scannedAt} <= make_interval(secs => ${input.windowSeconds})`,
        ),
      )
      .returning(),
  );
  // ADR-038 — the points are gone from the board on the very next read.
  if (row !== null) invalidateTag(SCOREBOARD_TAG);
  return row;
}

export async function countScans(db: Executor): Promise<number> {
  const rows = await db.select({ total: sql<number>`count(*)::int` }).from(fringeScans);
  return firstOrDefault(rows, { total: 0 }).total;
}
