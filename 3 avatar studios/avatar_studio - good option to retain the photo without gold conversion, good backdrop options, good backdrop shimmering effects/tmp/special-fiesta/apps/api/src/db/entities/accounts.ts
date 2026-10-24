import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { newId } from '../ids.js';
import {
  facilitatorAccounts,
  fringeActivities,
  superadminAccounts,
  tournamentCourts,
} from '../schema/index.js';
import type { FacilitatorRow, SuperadminRow } from '../schema/index.js';
import { firstOrDefault, firstOrNull, firstOrThrow } from '../rows.js';

/**
 * fds.md §2.10/§2.11 — staff accounts. F41 (delete facilitator) is deliberately absent:
 * accounts persist so audit foreign keys stay valid.
 */

export interface FacilitatorRecord extends FacilitatorRow {
  defaultStationLabel: string | null;
}

function facilitatorQuery(db: Executor) {
  return db
    .select({
      id: facilitatorAccounts.id,
      username: facilitatorAccounts.username,
      passcode: facilitatorAccounts.passcode,
      displayLabel: facilitatorAccounts.displayLabel,
      defaultStationType: facilitatorAccounts.defaultStationType,
      defaultStationId: facilitatorAccounts.defaultStationId,
      createdAt: facilitatorAccounts.createdAt,
      lastLoginAt: facilitatorAccounts.lastLoginAt,
      lastSeenAt: facilitatorAccounts.lastSeenAt,
      // ADR-280 — a court station names its court again, from the rebuilt tournament's courts.
      defaultStationLabel: sql<string | null>`coalesce(
          (SELECT a.activity_name FROM fringe_activity a WHERE a.id = ${facilitatorAccounts.defaultStationId}),
          (SELECT tc.label FROM tournament_court tc WHERE tc.id = ${facilitatorAccounts.defaultStationId}))`,
    })
    .from(facilitatorAccounts);
}

export async function listFacilitators(db: Executor): Promise<FacilitatorRecord[]> {
  return facilitatorQuery(db).orderBy(asc(sql`lower(${facilitatorAccounts.username})`));
}

/**
 * ADR-151 — the presence flusher's facilitator half, the exact shape of `touchScreenKeysSeen`.
 * One statement for everyone seen in the interval; no-op when nobody was.
 */
export async function touchFacilitatorsSeen(db: Executor, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(facilitatorAccounts)
    .set({ lastSeenAt: new Date() })
    .where(inArray(facilitatorAccounts.id, [...ids]));
}

export async function findFacilitatorById(
  db: Executor,
  facilitatorId: string,
): Promise<FacilitatorRecord | null> {
  return firstOrNull(await facilitatorQuery(db).where(eq(facilitatorAccounts.id, facilitatorId)));
}

export async function findFacilitatorByUsername(
  db: Executor,
  username: string,
): Promise<FacilitatorRow | null> {
  return firstOrNull(
    await db
      .select()
      .from(facilitatorAccounts)
      .where(eq(sql`lower(${facilitatorAccounts.username})`, username.toLowerCase())),
  );
}

export interface NewFacilitator {
  username: string;
  passcode: string;
  displayLabel?: string | null | undefined;
  defaultStationType: 'court' | 'fringe_activity' | 'none';
  defaultStationId?: string | null | undefined;
}

export async function createFacilitator(
  db: Executor,
  input: NewFacilitator,
): Promise<FacilitatorRow> {
  return firstOrThrow(
    await db
      .insert(facilitatorAccounts)
      .values({
        id: newId(),
        username: input.username,
        passcode: input.passcode,
        displayLabel: input.displayLabel ?? null,
        defaultStationType: input.defaultStationType,
        defaultStationId: input.defaultStationId ?? null,
      })
      .returning(),
    'Facilitator insert returned no row',
  );
}

export interface FacilitatorEdit {
  facilitatorId: string;
  passcode?: string | undefined;
  displayLabel?: string | null | undefined;
  defaultStationType: 'court' | 'fringe_activity' | 'none';
  defaultStationId?: string | null | undefined;
}

export async function updateFacilitator(
  db: Executor,
  input: FacilitatorEdit,
): Promise<FacilitatorRow | null> {
  const patch = {
    displayLabel: input.displayLabel ?? null,
    defaultStationType: input.defaultStationType,
    defaultStationId: input.defaultStationId ?? null,
    ...(input.passcode ? { passcode: input.passcode } : {}),
  };
  return firstOrNull(
    await db
      .update(facilitatorAccounts)
      .set(patch)
      .where(eq(facilitatorAccounts.id, input.facilitatorId))
      .returning(),
  );
}

export async function touchFacilitatorLogin(db: Executor, facilitatorId: string): Promise<void> {
  await db
    .update(facilitatorAccounts)
    .set({ lastLoginAt: new Date() })
    .where(eq(facilitatorAccounts.id, facilitatorId));
}

export async function resolveStationLabel(
  db: Executor,
  station: { type: 'court' | 'fringe_activity' | 'none'; id: string | null },
): Promise<string | null> {
  if (station.type === 'none' || !station.id) return null;
  // ADR-280 — a court station's label is the rebuilt tournament's court label.
  if (station.type === 'court') {
    const court = firstOrNull(await db.select({ label: tournamentCourts.label }).from(tournamentCourts).where(eq(tournamentCourts.id, station.id)));
    return court?.label ?? null;
  }
  const row = firstOrNull(
    await db
      .select({ label: fringeActivities.activityName })
      .from(fringeActivities)
      .where(eq(fringeActivities.id, station.id)),
  );
  return row?.label ?? null;
}

export async function listSuperadmins(db: Executor): Promise<SuperadminRow[]> {
  return db
    .select()
    .from(superadminAccounts)
    .orderBy(asc(sql`lower(${superadminAccounts.username})`));
}

export async function findSuperadminByUsername(
  db: Executor,
  username: string,
): Promise<SuperadminRow | null> {
  return firstOrNull(await db
    .select()
    .from(superadminAccounts)
    .where(eq(sql`lower(${superadminAccounts.username})`, username.toLowerCase())));
}

export async function findSuperadminById(
  db: Executor,
  superadminId: string,
): Promise<SuperadminRow | null> {
  return firstOrNull(await db
    .select()
    .from(superadminAccounts)
    .where(eq(superadminAccounts.id, superadminId)));
}

export async function createSuperadmin(
  db: Executor,
  input: { username: string; passcode: string },
): Promise<SuperadminRow> {
  return firstOrThrow(await db
    .insert(superadminAccounts)
    .values({ id: newId(), username: input.username, passcode: input.passcode })
    .returning(), 'Superadmin insert returned no row');
}

export async function updateSuperadminPasscode(
  db: Executor,
  input: { superadminId: string; passcode: string },
): Promise<SuperadminRow | null> {
  return firstOrNull(await db
    .update(superadminAccounts)
    .set({ passcode: input.passcode })
    .where(eq(superadminAccounts.id, input.superadminId))
    .returning());
}

export async function touchSuperadminLogin(db: Executor, superadminId: string): Promise<void> {
  await db
    .update(superadminAccounts)
    .set({ lastLoginAt: new Date() })
    .where(eq(superadminAccounts.id, superadminId));
}

export async function countFacilitators(db: Executor): Promise<number> {
  const rows = await db.select({ total: sql<number>`count(*)::int` }).from(facilitatorAccounts);
  return firstOrDefault(rows, { total: 0 }).total;
}
