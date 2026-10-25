import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { AwardTier } from '@psd/contracts';
import type { AppDatabase, Executor } from '../client.js';
import { newId } from '../ids.js';
import { facilitatorAccounts, fringeActivities, fringeRounds } from '../schema/index.js';
import type { FringeActivityRow } from '../schema/index.js';
import { firstOrDefault, firstOrNull, firstOrThrow } from '../rows.js';

/** fds.md §2.7 #obj-fringeactivity, §3.5 #state-activity. */

export interface ActivityRecord extends FringeActivityRow {
  assignedFacilitatorUsername: string | null;
}

function activityQuery(db: Executor) {
  return db
    .select({
      id: fringeActivities.id,
      activityName: fringeActivities.activityName,
      awardTiers: fringeActivities.awardTiers,
      isActive: fringeActivities.isActive,
      assignedFacilitatorId: fringeActivities.assignedFacilitatorId,
      assignedFacilitatorUsername: facilitatorAccounts.username,
      createdAt: fringeActivities.createdAt,
    })
    .from(fringeActivities)
    .leftJoin(
      facilitatorAccounts,
      eq(facilitatorAccounts.id, fringeActivities.assignedFacilitatorId),
    );
}

export async function listActivities(db: Executor): Promise<ActivityRecord[]> {
  return activityQuery(db).orderBy(asc(sql`lower(${fringeActivities.activityName})`));
}

export async function findActivityById(
  db: Executor,
  activityId: string,
): Promise<ActivityRecord | null> {
  return firstOrNull(await activityQuery(db).where(eq(fringeActivities.id, activityId)));
}

export async function findActivityByName(
  db: Executor,
  activityName: string,
): Promise<FringeActivityRow | null> {
  return firstOrNull(await db
    .select()
    .from(fringeActivities)
    .where(eq(sql`lower(${fringeActivities.activityName})`, activityName.toLowerCase())));
}

export interface NewActivity {
  activityName: string;
  awardTiers: AwardTier[];
  assignedFacilitatorId?: string | null | undefined;
}

export async function createActivity(db: Executor, input: NewActivity): Promise<FringeActivityRow> {
  return firstOrThrow(await db
    .insert(fringeActivities)
    .values({
      id: newId(),
      activityName: input.activityName,
      awardTiers: input.awardTiers,
      assignedFacilitatorId: input.assignedFacilitatorId ?? null,
    })
    .returning(), 'Activity insert returned no row');
}

export async function updateActivity(
  db: Executor,
  input: NewActivity & { activityId: string },
): Promise<FringeActivityRow | null> {
  return firstOrNull(await db
    .update(fringeActivities)
    .set({
      activityName: input.activityName,
      awardTiers: input.awardTiers,
      assignedFacilitatorId: input.assignedFacilitatorId ?? null,
    })
    .where(eq(fringeActivities.id, input.activityId))
    .returning());
}

export async function activateActivity(
  db: Executor,
  activityId: string,
): Promise<FringeActivityRow | null> {
  return firstOrNull(await db
    .update(fringeActivities)
    .set({ isActive: true })
    .where(eq(fringeActivities.id, activityId))
    .returning());
}

/** §3.5 cascading effect — deactivating auto-closes any open/ended round on the activity. */
export async function deactivateActivity(
  db: AppDatabase,
  activityId: string,
): Promise<FringeActivityRow | null> {
  return db.transaction(async (tx) => {
    await tx
      .update(fringeRounds)
      .set({ status: 'closed', closedAt: new Date() })
      .where(
        and(eq(fringeRounds.activityId, activityId), inArray(fringeRounds.status, ['open', 'ended'])),
      );
    return firstOrNull(await tx
      .update(fringeActivities)
      .set({ isActive: false })
      .where(eq(fringeActivities.id, activityId))
      .returning());
  });
}

export async function countActivities(db: Executor): Promise<{ total: number; active: number }> {
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) FILTER (WHERE ${fringeActivities.isActive})::int`,
    })
    .from(fringeActivities);
  return firstOrDefault(rows, { total: 0, active: 0 });
}
