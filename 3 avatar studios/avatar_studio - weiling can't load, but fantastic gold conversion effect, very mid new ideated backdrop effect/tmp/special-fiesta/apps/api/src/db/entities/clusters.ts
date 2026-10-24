import { asc, eq, isNull, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { clusters, participants } from '../schema/index.js';
import type { ClusterRow } from '../schema/index.js';
import { firstOrNull } from '../rows.js';

/**
 * fds.md §2.2 #obj-cluster — the agency catalogue, editable since ADR-172.
 *
 * Two rules are enforced here rather than in the routes, because both are claims about data and
 * the routes would each have to re-derive them:
 *
 *   - a cluster is **retired, never deleted** (`retired_at`), because `chat_message` and
 *     `gallery_photo` snapshot its code forever;
 *   - retiring and reassigning are refused once **scoring has started**, because a participant's
 *     cluster is what the leaderboard groups by, so moving someone moves every point they have
 *     ever earned — retroactively, on a board the hall is watching.
 */

export interface ClusterRecord extends ClusterRow {
  /** Live members. The retire guard is about these, not about history. */
  memberCount: number;
}

function clusterQuery(db: Executor) {
  return db
    .select({
      code: clusters.code,
      displayName: clusters.displayName,
      retiredAt: clusters.retiredAt,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM participant p WHERE p.cluster_code = ${clusters.code}
      )`.as('member_count'),
    })
    .from(clusters);
}

/** Retired ones included: the superadmin console has to show what it may un-retire. */
export async function listClusters(db: Executor): Promise<ClusterRecord[]> {
  return clusterQuery(db).orderBy(asc(sql`lower(${clusters.displayName})`));
}

/** What signup offers: open clusters only, in catalogue order. */
export async function listOpenClusters(db: Executor): Promise<ClusterRow[]> {
  return db
    .select()
    .from(clusters)
    .where(isNull(clusters.retiredAt))
    .orderBy(asc(sql`lower(${clusters.displayName})`));
}

export async function findClusterByCode(db: Executor, code: string): Promise<ClusterRecord | null> {
  return firstOrNull(await clusterQuery(db).where(eq(clusters.code, code)));
}

/** Codes are compared case-insensitively so `OLI` and `oli` cannot both exist. */
export async function findClusterByCodeInsensitive(
  db: Executor,
  code: string,
): Promise<ClusterRow | null> {
  return firstOrNull(
    await db
      .select()
      .from(clusters)
      .where(eq(sql`lower(${clusters.code})`, code.toLowerCase())),
  );
}

export async function createCluster(
  db: Executor,
  input: { code: string; displayName: string },
): Promise<ClusterRow> {
  const rows = await db.insert(clusters).values(input).returning();
  return rows[0] as ClusterRow;
}

/** Only the label moves. The code is the key three tables point at (ADR-172). */
export async function renameCluster(
  db: Executor,
  code: string,
  displayName: string,
): Promise<void> {
  await db.update(clusters).set({ displayName }).where(eq(clusters.code, code));
}

/**
 * Two functions rather than one with a boolean, because `setClusterRetired(db, code, false)`
 * reads as neither retiring nor restoring at the call site.
 */
export async function retireCluster(db: Executor, code: string): Promise<void> {
  await db.update(clusters).set({ retiredAt: new Date() }).where(eq(clusters.code, code));
}

export async function restoreCluster(db: Executor, code: string): Promise<void> {
  await db.update(clusters).set({ retiredAt: null }).where(eq(clusters.code, code));
}

/**
 * Has anything been scored yet?
 *
 * A non-voided fringe scan — the source `participantPoints` aggregates in `leaderboard.ts` that a
 * cluster move would re-attribute — or a tournament payment still being paid (ADR-276), which the
 * board credits to each player's current cluster the same way. Asked as `EXISTS` so Postgres can stop
 * at the first row; this runs on every catalogue mutation.
 */
export async function hasScoringStarted(db: Executor): Promise<boolean> {
  const rows = await db.execute<{ started: boolean }>(sql`
    SELECT (
      EXISTS (SELECT 1 FROM fringe_scan WHERE is_voided = false)
      OR EXISTS (SELECT 1 FROM tournament_award WHERE voided_at IS NULL)
    ) AS started
  `);
  const first = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows?.[0]) as
    | { started: boolean }
    | undefined;
  return first?.started ?? false;
}

/** Moves every member of one cluster to another. Returns how many moved. */
export async function reassignClusterMembers(
  db: Executor,
  fromCode: string,
  toCode: string,
): Promise<number> {
  const moved = await db
    .update(participants)
    .set({ clusterCode: toCode })
    .where(eq(participants.clusterCode, fromCode))
    .returning({ id: participants.id });
  return moved.length;
}

export async function reassignParticipantCluster(
  db: Executor,
  participantId: string,
  toCode: string,
): Promise<void> {
  await db
    .update(participants)
    .set({ clusterCode: toCode })
    .where(eq(participants.id, participantId));
}
