import { eq } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { newId } from '../ids.js';
import { pointConfigs, superadminAccounts } from '../schema/index.js';
import type { PointConfigRow } from '../schema/index.js';
import { firstOrNull, firstOrThrow } from '../rows.js';

/**
 * fds.md §2.12 #obj-pointconfig — singleton, never seeded. ADR-270 — fringe settings only: the
 * tournament's rates moved onto the tournament, so this row no longer gates a match start.
 */

export interface PointConfigRecord extends PointConfigRow {
  updatedByUsername: string;
}

export async function findPointConfig(db: Executor): Promise<PointConfigRecord | null> {
  return firstOrNull(
    await db
      .select({
        id: pointConfigs.id,
        singleton: pointConfigs.singleton,
        fringeParticipationPoints: pointConfigs.fringeParticipationPoints,
        fringePassportBonusPoints: pointConfigs.fringePassportBonusPoints,
        fringePassportStations: pointConfigs.fringePassportStations,
        updatedAt: pointConfigs.updatedAt,
        updatedBySuperadminId: pointConfigs.updatedBySuperadminId,
        updatedByUsername: superadminAccounts.username,
      })
      .from(pointConfigs)
      .innerJoin(superadminAccounts, eq(superadminAccounts.id, pointConfigs.updatedBySuperadminId)),
  );
}

export interface PointConfigInput {
  fringeParticipationPoints: number;
  /** ADR-176 — the passport bonus and its distinct-station threshold; 0 is off. */
  fringePassportBonusPoints: number;
  fringePassportStations: number;
  superadminId: string;
}

export async function savePointConfig(
  db: Executor,
  input: PointConfigInput,
): Promise<PointConfigRow> {
  return firstOrThrow(
    await db
      .insert(pointConfigs)
      .values({
        id: newId(),
        singleton: true,
        fringeParticipationPoints: input.fringeParticipationPoints,
        fringePassportBonusPoints: input.fringePassportBonusPoints,
        fringePassportStations: input.fringePassportStations,
        updatedBySuperadminId: input.superadminId,
      })
      .onConflictDoUpdate({
        target: pointConfigs.singleton,
        set: {
          fringeParticipationPoints: input.fringeParticipationPoints,
          fringePassportBonusPoints: input.fringePassportBonusPoints,
          fringePassportStations: input.fringePassportStations,
          updatedBySuperadminId: input.superadminId,
          updatedAt: new Date(),
        },
      })
      .returning(),
    'PointConfig upsert returned no row',
  );
}
