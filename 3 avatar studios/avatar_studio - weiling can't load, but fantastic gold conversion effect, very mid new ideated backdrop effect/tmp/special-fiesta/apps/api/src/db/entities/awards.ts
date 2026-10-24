import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, inArray, not, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AppDatabase, AppTransaction, Executor } from '../client.js';
import { SCOREBOARD_TAG, invalidateTag } from '../../lib/cache.js';
import { newId } from '../ids.js';
import { awardBatches, scoreAdjustments, superadminAccounts, teamAwards, teams } from '../schema/index.js';
import type { AwardBatchRow, TeamAwardRow } from '../schema/index.js';
import { firstOrNull, firstOrThrow } from '../rows.js';
import { appendVoidAudit } from './audit.js';
import { listAdjustmentsForBatch, type AdjustmentRecord } from './adjustments.js';
import { rosterSnapshot } from './teams.js';

/**
 * ADR-248 — a batch of awards, posted at the end of a day and taken back as a unit.
 *
 * Two ledgers in one transaction under one header: a team award rows in `team_award` (the shape the board
 * already reads), a participant award rows in `score_adjustment` (the shape the manual correction ledger
 * already is) with `batch_id` pointing back here. Nothing is duplicated except the roster, which is a
 * snapshot for the same reason a match's is: it records what was true when the decision was made.
 *
 * There is no edit and no delete. The only way to change a posted batch is to reverse it, which is why
 * `is_reversed` sits on the header rather than being a signal to go and remove rows: the reversal is a
 * fact about the day, and the day's register has to keep saying so.
 */

/** One team's line in a batch, before the roster is read. */
export interface NewTeamAward {
  teamId: string;
  points: number;
}

/** One participant's line in a batch. The activity is what the points are attributed to. */
export interface NewParticipantAward {
  participantId: string;
  activityId: string;
  activityNameSnapshot: string;
  points: number;
}

export interface NewAwardBatch {
  clientBatchUuid: string;
  label: string;
  reason: string;
  createdBySuperadminId: string;
  teams: readonly NewTeamAward[];
  participants: readonly NewParticipantAward[];
}

export interface AwardBatchHeader extends AwardBatchRow {
  createdByUsername: string;
  reversedByUsername: string | null;
}

/** A team's line, with the roster the batch froze and the names the register prints. */
export interface TeamAwardRecord extends TeamAwardRow {
  teamName: string;
  batchLabel: string;
  batchReversed: boolean;
  /** Whose points these are. The board reads the same jsonb grammar off a completed match. */
  participantIds: string[];
}

/** One batch and both halves of it. The totals are derived from the rows, never stored. */
export interface AwardBatchRecord {
  header: AwardBatchHeader;
  teamAwards: TeamAwardRecord[];
  participantAwards: AdjustmentRecord[];
}

/** What the register shows per batch: the header and the size of each half, without the rows. */
export interface AwardBatchSummary {
  header: AwardBatchHeader;
  teamCount: number;
  teamTotal: number;
  participantCount: number;
  participantTotal: number;
}

export type AwardBatchWrite =
  | { outcome: 'created' | 'retry'; batch: AwardBatchRecord }
  /**
   * The key was seen before and the body is not what it stands for (ADR-248). `retry` is the offline queue
   * being acknowledged; this is a console that has lost track of what it already posted, and answering it
   * 200 would throw away a batch someone meant to make.
   */
  | { outcome: 'conflict'; batch: AwardBatchRecord };

export type AwardBatchReversal = 'applied' | 'no_batch' | 'already';

/**
 * A batch is written whole or not at all, and an identical retry is a no-op — the same three outcomes a
 * scan returns, for the same reason.
 */
export async function createAwardBatch(db: AppDatabase, input: NewAwardBatch): Promise<AwardBatchWrite> {
  const replayed = await findAwardBatchByClientUuid(db, input.clientBatchUuid);
  if (replayed !== null) return { outcome: sameBatch(replayed, input) ? 'retry' : 'conflict', batch: replayed };

  const batchId = await db.transaction(async (tx) => await insertBatch(tx, input));
  if (batchId === null) {
    // Somebody else holds the key now, so that row decides what the retry meant: the same payload is an
    // acknowledgement, a different one is a clash. A key that refused the insert while holding nothing is
    // not a state to reason about, and saying so is the last honest thing left to do.
    const twin = await findAwardBatchByClientUuid(db, input.clientBatchUuid);
    if (twin !== null) return { outcome: sameBatch(twin, input) ? 'retry' : 'conflict', batch: twin };
    throw new Error('AwardBatch insert was refused by a key that no batch holds');
  }
  // The board counts awards, so the board has to be re-read.
  invalidateTag(SCOREBOARD_TAG);
  return { outcome: 'created', batch: await assembleBatch(db, await batchHeader(db, batchId)) };
}

async function insertBatch(tx: AppTransaction, input: NewAwardBatch): Promise<string | null> {
  const batchId = newId();
  const header = firstOrNull(
    await tx
      .insert(awardBatches)
      .values({
        id: batchId,
        clientBatchUuid: input.clientBatchUuid,
        label: input.label,
        reason: input.reason,
        createdBySuperadminId: input.createdBySuperadminId,
      })
      .onConflictDoNothing()
      .returning({ id: awardBatches.id }),
  );
  if (header === null) return null;
  for (const award of input.teams) {
    await tx.insert(teamAwards).values({
      id: newId(),
      teamId: award.teamId,
      batchId,
      points: award.points,
      rosterSnapshot: await rosterSnapshot(tx, award.teamId),
    });
  }
  for (const award of input.participants) {
    // The same columns `createAdjustment` writes, and deliberately not that function: it reads its row back
    // to hand the desk a view, and a batch of 64 does not need 64 read-backs to be posted. The batch's
    // reason is copied into each row rather than referenced, because `score_adjustment.reason` is NOT NULL
    // and the additive section may not relax a column.
    await tx
      .insert(scoreAdjustments)
      .values({
        id: newId(),
        participantId: award.participantId,
        activityId: award.activityId,
        points: award.points,
        reason: input.reason,
        activityNameSnapshot: award.activityNameSnapshot,
        createdBySuperadminId: input.createdBySuperadminId,
        batchId,
      });
  }
  return batchId;
}

/**
 * Whether a re-arriving body is the batch the key already holds. Rows are compared as multisets of
 * `id:points`, because the console may list the same award in another order and mean the same thing, while
 * a different point value for the same team is a different decision.
 */
function sameBatch(held: AwardBatchRecord, input: NewAwardBatch): boolean {
  const rows = (ids: readonly string[]) => [...ids].sort().join('|');
  return (
    held.header.label === input.label &&
    held.header.reason === input.reason &&
    rows(held.teamAwards.map((row) => `${row.teamId}:${row.points}`)) ===
      rows(input.teams.map((row) => `${row.teamId}:${row.points}`)) &&
    rows(held.participantAwards.map((row) => `${row.participantId}:${row.activityId}:${row.points}`)) ===
      rows(input.participants.map((row) => `${row.participantId}:${row.activityId}:${row.points}`))
  );
}

function batchHeaderQuery(db: Executor) {
  const reversedBy = alias(superadminAccounts, 'awardBatchReversedBy');
  return db
    .select({
      id: awardBatches.id,
      clientBatchUuid: awardBatches.clientBatchUuid,
      label: awardBatches.label,
      reason: awardBatches.reason,
      createdBySuperadminId: awardBatches.createdBySuperadminId,
      isReversed: awardBatches.isReversed,
      reversedAt: awardBatches.reversedAt,
      reversedBySuperadminId: awardBatches.reversedBySuperadminId,
      reversedReason: awardBatches.reversedReason,
      createdAt: awardBatches.createdAt,
      createdByUsername: superadminAccounts.username,
      reversedByUsername: reversedBy.username,
    })
    .from(awardBatches)
    .innerJoin(superadminAccounts, eq(superadminAccounts.id, awardBatches.createdBySuperadminId))
    .leftJoin(reversedBy, eq(reversedBy.id, awardBatches.reversedBySuperadminId));
}

/** A team's line joined to the batch that carries it, because a reversed one must read as reversed. */
function teamAwardQuery(db: Executor) {
  return db
    .select({
      id: teamAwards.id,
      teamId: teamAwards.teamId,
      batchId: teamAwards.batchId,
      points: teamAwards.points,
      rosterSnapshot: teamAwards.rosterSnapshot,
      createdAt: teamAwards.createdAt,
      teamName: teams.teamName,
      batchLabel: awardBatches.label,
      batchReversed: awardBatches.isReversed,
    })
    .from(teamAwards)
    .innerJoin(teams, eq(teams.id, teamAwards.teamId))
    .innerJoin(awardBatches, eq(awardBatches.id, teamAwards.batchId))
    .orderBy(asc(teams.teamName));
}

/**
 * A team's rows under one predicate — the batch's own, or one team's whole history. The roster needs no
 * cast and no parser of its own: `team_award.roster_snapshot` is declared `$type<RosterSnapshotEntry[]>`
 * in the mirror, the one jsonb grammar for "who was on the team" (ADR-005), so readers cannot drift.
 */
async function teamAwardRows(db: Executor, where: SQL): Promise<TeamAwardRecord[]> {
  const rows = await teamAwardQuery(db).where(where);
  return rows.map((row) => ({
    ...row,
    participantIds: row.rosterSnapshot.map((entry) => entry.participantId),
  }));
}

async function assembleBatch(db: Executor, header: AwardBatchHeader): Promise<AwardBatchRecord> {
  return {
    header,
    teamAwards: await teamAwardRows(db, eq(teamAwards.batchId, header.id)),
    participantAwards: await listAdjustmentsForBatch(db, header.id),
  };
}

/** The header of a batch the caller has just written or read: its absence is a bug, not an outcome. */
async function batchHeader(db: Executor, batchId: string): Promise<AwardBatchHeader> {
  return firstOrThrow(
    await batchHeaderQuery(db).where(eq(awardBatches.id, batchId)).limit(1),
    'AwardBatch header read found nothing',
  );
}

export async function findAwardBatch(db: Executor, batchId: string): Promise<AwardBatchRecord | null> {
  const header = firstOrNull(await batchHeaderQuery(db).where(eq(awardBatches.id, batchId)).limit(1));
  return header === null ? null : await assembleBatch(db, header);
}

/** Idempotence's lookup: the retry key in, the batch it stands for out. */
export async function findAwardBatchByClientUuid(
  db: Executor,
  clientBatchUuid: string,
): Promise<AwardBatchRecord | null> {
  const header = firstOrNull(
    await batchHeaderQuery(db).where(eq(awardBatches.clientBatchUuid, clientBatchUuid)).limit(1),
  );
  return header === null ? null : await assembleBatch(db, header);
}

/**
 * The register, newest first. The rows themselves are only read for one batch at a time: the list needs
 * to say how big each batch is, and reading 64 rows for every batch to count them in JavaScript is how a
 * register becomes a query that grows with the day.
 */
export async function listAwardBatches(db: Executor, limit: number): Promise<AwardBatchSummary[]> {
  const headers = await batchHeaderQuery(db).orderBy(desc(awardBatches.createdAt)).limit(limit);
  if (headers.length === 0) return [];
  const ids = headers.map((header) => header.id);
  const [team, participant] = await Promise.all([teamTotals(db, ids), participantTotals(db, ids)]);
  return headers.map((header) => ({ header, ...totalsFor(header.id, team, participant) }));
}

function totalsFor(batchId: string, team: LedgerTotals[], participant: LedgerTotals[]): Omit<AwardBatchSummary, 'header'> {
  const line = (rows: LedgerTotals[]) => rows.find((row) => row.batchId === batchId);
  const teamRow = line(team);
  const participantRow = line(participant);
  return {
    teamCount: teamRow?.count ?? 0,
    teamTotal: teamRow?.total ?? 0,
    participantCount: participantRow?.count ?? 0,
    participantTotal: participantRow?.total ?? 0,
  };
}

/**
 * The two half-queries of the register. Written per ledger rather than generically, because a helper that
 * takes a table and a pair of columns loses the type that says `points` is an integer, and the register is
 * two statements either way.
 */
interface LedgerTotals {
  /** Nullable on the adjustment side, because a batch is not the only way to post there. */
  batchId: string | null;
  count: number;
  total: number;
}

async function teamTotals(db: Executor, ids: readonly string[]): Promise<LedgerTotals[]> {
  return db
    .select({
      batchId: teamAwards.batchId,
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${teamAwards.points}), 0)::int`,
    })
    .from(teamAwards)
    .where(inArray(teamAwards.batchId, ids))
    .groupBy(teamAwards.batchId);
}

async function participantTotals(db: Executor, ids: readonly string[]): Promise<LedgerTotals[]> {
  return db
    .select({
      batchId: scoreAdjustments.batchId,
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${scoreAdjustments.points}), 0)::int`,
    })
    .from(scoreAdjustments)
    .where(inArray(scoreAdjustments.batchId, ids))
    .groupBy(scoreAdjustments.batchId);
}

/**
 * The one reversible write. Both directions go through it so the guard and the audit row cannot be spelled
 * differently for one of them, the way void and unvoid share `setMatchVoided`.
 */
async function stampReversal(
  db: AppDatabase,
  input: { batchId: string; superadminId: string; reason: string; action: 'void' | 'unvoid' },
): Promise<AwardBatchReversal> {
  const reversed = input.action === 'void';
  const written = await db.transaction(async (tx) => {
    const stamped = firstOrNull(
      await tx
        .update(awardBatches)
        .set(
          reversed
            ? {
                isReversed: true,
                reversedAt: new Date(),
                reversedBySuperadminId: input.superadminId,
                reversedReason: input.reason,
              }
            : { isReversed: false, reversedAt: null, reversedBySuperadminId: null, reversedReason: null },
        )
        // The guard is what makes a double click a no-op instead of a second opinion about the same batch.
        .where(and(eq(awardBatches.id, input.batchId), reversed ? not(awardBatches.isReversed) : sql`${awardBatches.isReversed}`))
        .returning({ id: awardBatches.id }),
    );
    if (stamped === null) return null;
    await appendVoidAudit(tx, {
      targetType: 'awardbatch',
      targetId: input.batchId,
      action: input.action,
      reason: input.reason,
      superadminId: input.superadminId,
    });
    return stamped.id;
  });
  if (written === null) {
    // Two answers rather than one, because they are two different things for a console to be told:
    // "that batch is not here" and "that batch is already where you are asking to put it".
    const exists = firstOrNull(
      await db
        .select({ id: awardBatches.id })
        .from(awardBatches)
        .where(eq(awardBatches.id, input.batchId))
        .limit(1),
    );
    return exists === null ? 'no_batch' : 'already';
  }
  invalidateTag(SCOREBOARD_TAG);
  return 'applied';
}

export function reverseAwardBatch(db: AppDatabase, input: { batchId: string; superadminId: string; reason: string }) {
  return stampReversal(db, { ...input, action: 'void' });
}

export function reinstateAwardBatch(db: AppDatabase, input: { batchId: string; superadminId: string; reason: string }) {
  return stampReversal(db, { ...input, action: 'unvoid' });
}

/** The team's own ledger: what it was awarded, batch by batch, reversed ones included and marked. */
/**
 * The team's own ledger: what it was awarded, batch by batch, newest first, reversed ones included and
 * marked. The live total is not here — it is the ledger minus the reversed lines, which the view works out
 * so that "what it is worth now" and "what was decided" cannot be answered by two different queries.
 */
export async function listTeamAwards(db: Executor, teamId: string): Promise<TeamAwardRecord[]> {
  const rows = await teamAwardRows(db, eq(teamAwards.teamId, teamId));
  return rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}
