import { and, eq, inArray, not, sql } from 'drizzle-orm';
import type { AppDatabase, Executor } from '../client.js';
import { newId } from '../ids.js';
import {
  facilitatorAccounts,
  participants,
  swagClaims,
  swagRounds,
  swagStations,
} from '../schema/index.js';
import type { SwagClaimRow, SwagItem, SwagRoundRow, SwagStationRow } from '../schema/index.js';
import { firstOrDefault, firstOrNull, firstOrThrow } from '../rows.js';

/**
 * ADR-110 — the swag counter: the fringe trio (activity/round/scan) mirrored as
 * station/round/claim. Rounds behave identically (§3.3 single-active, advance, end);
 * the write-side difference is ALLOWANCE: a claim consumes one of `item.limit` per
 * participant per round instead of awarding points, and the limit check plus insert run
 * in one transaction. The idempotency contract is the scan's: a replayed
 * `client_claim_uuid` reports `duplicate`, never a second handout.
 */

// ---------------------------------------------------------------------------- stations

export async function createSwagStation(
  db: Executor,
  input: { stationName: string; items: SwagItem[] },
): Promise<SwagStationRow> {
  return firstOrThrow(
    await db
      .insert(swagStations)
      .values({ id: newId(), stationName: input.stationName, items: input.items })
      .returning(),
    'Swag station insert returned no row',
  );
}

export async function listSwagStations(db: Executor): Promise<SwagStationRow[]> {
  return db.select().from(swagStations).orderBy(sql`lower(${swagStations.stationName})`);
}

export async function findSwagStationById(
  db: Executor,
  stationId: string,
): Promise<SwagStationRow | null> {
  return firstOrNull(await db.select().from(swagStations).where(eq(swagStations.id, stationId)));
}

export async function setSwagStationActive(
  db: Executor,
  input: { stationId: string; isActive: boolean },
): Promise<SwagStationRow | null> {
  return firstOrNull(
    await db
      .update(swagStations)
      .set({ isActive: input.isActive })
      .where(eq(swagStations.id, input.stationId))
      .returning(),
  );
}

export async function updateSwagStation(
  db: Executor,
  input: { stationId: string; stationName: string; items: SwagItem[] },
): Promise<SwagStationRow | null> {
  return firstOrNull(
    await db
      .update(swagStations)
      .set({ stationName: input.stationName, items: input.items })
      .where(eq(swagStations.id, input.stationId))
      .returning(),
  );
}

// ------------------------------------------------------------------------------ rounds

export interface SwagRoundRecord extends SwagRoundRow {
  openedByUsername: string;
  claimCount: number;
}

function roundQuery(db: Executor) {
  return db
    .select({
      id: swagRounds.id,
      stationId: swagRounds.stationId,
      roundNumber: swagRounds.roundNumber,
      status: swagRounds.status,
      openedAt: swagRounds.openedAt,
      closedAt: swagRounds.closedAt,
      openedByFacilitatorId: swagRounds.openedByFacilitatorId,
      openedByUsername: facilitatorAccounts.username,
      claimCount: sql<number>`(
        SELECT count(*)::int FROM swag_claim c WHERE c.round_id = ${swagRounds.id}
      )`,
    })
    .from(swagRounds)
    .innerJoin(facilitatorAccounts, eq(facilitatorAccounts.id, swagRounds.openedByFacilitatorId));
}

export async function findSwagRoundById(
  db: Executor,
  roundId: string,
): Promise<SwagRoundRecord | null> {
  return firstOrNull(await roundQuery(db).where(eq(swagRounds.id, roundId)));
}

export async function requireSwagRoundRecord(
  db: Executor,
  roundId: string,
): Promise<SwagRoundRecord> {
  return firstOrThrow(await roundQuery(db).where(eq(swagRounds.id, roundId)), 'Swag round');
}

/** §3.3's twin — at most one round per station is open or ended. */
export async function findCurrentSwagRound(
  db: Executor,
  stationId: string,
): Promise<SwagRoundRecord | null> {
  return firstOrNull(
    await roundQuery(db).where(
      and(eq(swagRounds.stationId, stationId), inArray(swagRounds.status, ['open', 'ended'])),
    ),
  );
}

async function nextSwagRoundNumber(tx: Executor, stationId: string): Promise<number> {
  const rows = await tx
    .select({ highest: sql<number>`coalesce(max(${swagRounds.roundNumber}), 0)::int` })
    .from(swagRounds)
    .where(eq(swagRounds.stationId, stationId));
  return firstOrDefault(rows, { highest: 0 }).highest + 1;
}

export async function openSwagRound(
  db: AppDatabase,
  input: { stationId: string; facilitatorId: string },
): Promise<SwagRoundRow> {
  return db.transaction(async (tx) => {
    const roundNumber = await nextSwagRoundNumber(tx, input.stationId);
    return firstOrThrow(
      await tx
        .insert(swagRounds)
        .values({
          id: newId(),
          stationId: input.stationId,
          roundNumber,
          status: 'open',
          openedByFacilitatorId: input.facilitatorId,
        })
        .returning(),
      'Swag round insert returned no row',
    );
  });
}

/** The fringe advance's twin: atomic close + open, a fresh allowance for everyone. */
export async function advanceSwagRound(
  db: AppDatabase,
  input: { round: SwagRoundRow; facilitatorId: string },
): Promise<SwagRoundRow> {
  return db.transaction(async (tx) => {
    await tx
      .update(swagRounds)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(swagRounds.id, input.round.id));
    return firstOrThrow(
      await tx
        .insert(swagRounds)
        .values({
          id: newId(),
          stationId: input.round.stationId,
          roundNumber: input.round.roundNumber + 1,
          status: 'open',
          openedByFacilitatorId: input.facilitatorId,
        })
        .returning(),
      'Swag round insert returned no row',
    );
  });
}

/** DC-003's twin — end for the day, reversible by opening the next round. */
export async function endSwagRound(db: Executor, roundId: string): Promise<SwagRoundRow | null> {
  return firstOrNull(
    await db
      .update(swagRounds)
      .set({ status: 'ended', closedAt: new Date() })
      .where(and(eq(swagRounds.id, roundId), inArray(swagRounds.status, ['open', 'ended'])))
      .returning(),
  );
}

// ------------------------------------------------------------------------------ claims

export interface SwagClaimRecord extends SwagClaimRow {
  participantNickname: string;
  clusterCode: string;
}

function claimQuery(db: Executor) {
  return db
    .select({
      id: swagClaims.id,
      participantId: swagClaims.participantId,
      roundId: swagClaims.roundId,
      stationId: swagClaims.stationId,
      facilitatorId: swagClaims.facilitatorId,
      stationNameSnapshot: swagClaims.stationNameSnapshot,
      roundNumberSnapshot: swagClaims.roundNumberSnapshot,
      itemLabelSnapshot: swagClaims.itemLabelSnapshot,
      facilitatorUsernameSnapshot: swagClaims.facilitatorUsernameSnapshot,
      clientClaimUuid: swagClaims.clientClaimUuid,
      claimedAt: swagClaims.claimedAt,
      isVoided: swagClaims.isVoided,
      undoneAt: swagClaims.undoneAt,
      participantNickname: participants.nickname,
      clusterCode: participants.clusterCode,
    })
    .from(swagClaims)
    .innerJoin(participants, eq(participants.id, swagClaims.participantId));
}

export async function listSwagClaimsForRound(
  db: Executor,
  roundId: string,
): Promise<SwagClaimRecord[]> {
  return claimQuery(db).where(eq(swagClaims.roundId, roundId)).orderBy(sql`claimed_at DESC`);
}

export async function findSwagClaimById(
  db: Executor,
  claimId: string,
): Promise<SwagClaimRecord | null> {
  return firstOrNull(await claimQuery(db).where(eq(swagClaims.id, claimId)));
}

/** Re-read of a claim this request just wrote: its absence is a broken invariant, not a 404. */
export async function requireSwagClaimRecord(
  db: Executor,
  claimId: string,
): Promise<SwagClaimRecord> {
  return firstOrThrow(await claimQuery(db).where(eq(swagClaims.id, claimId)), 'Swag claim');
}

export interface SwagClaimFilters {
  stationId?: string | undefined;
  participantId?: string | undefined;
  roundId?: string | undefined;
}

/** ADR-159 — the superadmin list, filterable, shaped like `listScans`. */
export async function listSwagClaims(
  db: Executor,
  filters: SwagClaimFilters = {},
): Promise<SwagClaimRecord[]> {
  const conditions = [
    filters.stationId ? eq(swagClaims.stationId, filters.stationId) : undefined,
    filters.participantId ? eq(swagClaims.participantId, filters.participantId) : undefined,
    filters.roundId ? eq(swagClaims.roundId, filters.roundId) : undefined,
  ].filter(Boolean);
  return claimQuery(db)
    .where(and(...conditions))
    .orderBy(sql`claimed_at DESC`);
}

export async function setSwagClaimVoided(
  db: Executor,
  input: { claimId: string; isVoided: boolean },
): Promise<SwagClaimRow | null> {
  return firstOrNull(
    await db
      .update(swagClaims)
      .set({ isVoided: input.isVoided })
      .where(eq(swagClaims.id, input.claimId))
      .returning(),
  );
}

/**
 * ADR-159, mirroring ADR-138 — the counter's own ten-second take-back, decided entirely
 * inside this statement.
 *
 * Every condition is in the WHERE for the reason ADR-138 gives: a read-then-write decides
 * against a row it has already let go of, so two taps, or a superadmin voiding the same claim
 * in the same second, would have the later writer overwrite a state it never saw. `null`
 * collapses expired, already-voided, not-yours and raced into one refusal.
 *
 * The window matters more here than it does for a scan. Undoing a scan restores a number;
 * undoing a claim asserts the item came back across the table, which is only plausible while
 * the participant is still standing there. Ten seconds is roughly that long.
 */
export async function undoSwagClaimAtStation(
  db: Executor,
  input: { claimId: string; facilitatorId: string; windowSeconds: number },
): Promise<SwagClaimRow | null> {
  return firstOrNull(
    await db
      .update(swagClaims)
      .set({ isVoided: true, undoneAt: new Date() })
      .where(
        and(
          eq(swagClaims.id, input.claimId),
          eq(swagClaims.facilitatorId, input.facilitatorId),
          not(swagClaims.isVoided),
          sql`now() - ${swagClaims.claimedAt} <= make_interval(secs => ${input.windowSeconds})`,
        ),
      )
      .returning(),
  );
}

export interface NewSwagClaim {
  participantId: string;
  roundId: string;
  stationId: string;
  facilitatorId: string;
  stationNameSnapshot: string;
  roundNumberSnapshot: number;
  itemLabelSnapshot: string;
  itemLimit: number;
  facilitatorUsernameSnapshot: string;
  clientClaimUuid: string;
}

export type ClaimOutcome =
  | { kind: 'claimed'; claim: SwagClaimRow }
  | { kind: 'duplicate'; claim: SwagClaimRow }
  | { kind: 'limit_reached'; taken: number };

/**
 * One transaction: replayed uuid → the original row (never a second handout); allowance
 * exhausted → a refusal carrying how many they already took; otherwise the claim lands.
 */
export async function createSwagClaim(db: AppDatabase, input: NewSwagClaim): Promise<ClaimOutcome> {
  return db.transaction(async (tx) => {
    const replayed = firstOrNull(
      await tx.select().from(swagClaims).where(eq(swagClaims.clientClaimUuid, input.clientClaimUuid)),
    );
    if (replayed) return { kind: 'duplicate', claim: replayed };
    const counted = await tx
      .select({ taken: sql<number>`count(*)::int` })
      .from(swagClaims)
      .where(
        and(
          eq(swagClaims.roundId, input.roundId),
          eq(swagClaims.participantId, input.participantId),
          eq(swagClaims.itemLabelSnapshot, input.itemLabelSnapshot),
          // ADR-159 — a voided claim gives the allowance back. Without this the reversal
          // would restore nothing a participant can use: the row is what the limit counts.
          not(swagClaims.isVoided),
        ),
      );
    const taken = firstOrDefault(counted, { taken: 0 }).taken;
    if (taken >= input.itemLimit) return { kind: 'limit_reached', taken };
    const claim = firstOrThrow(
      await tx
        .insert(swagClaims)
        .values({
          id: newId(),
          participantId: input.participantId,
          roundId: input.roundId,
          stationId: input.stationId,
          facilitatorId: input.facilitatorId,
          stationNameSnapshot: input.stationNameSnapshot,
          roundNumberSnapshot: input.roundNumberSnapshot,
          itemLabelSnapshot: input.itemLabelSnapshot,
          facilitatorUsernameSnapshot: input.facilitatorUsernameSnapshot,
          clientClaimUuid: input.clientClaimUuid,
        })
        .returning(),
      'Swag claim insert returned no row',
    );
    return { kind: 'claimed', claim };
  });
}
