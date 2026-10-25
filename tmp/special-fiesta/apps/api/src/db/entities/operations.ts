import { eq, max, not, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import {
  fringeActivities,
  fringeRounds,
  fringeScans,
  swagClaims,
  swagRounds,
  swagStations,
} from '../schema/index.js';

/**
 * ADR-151 — the aggregates behind the operations overview, and nothing else.
 *
 * Every query here is bounded by the number of STATIONS, never by the number of scans: each
 * one groups inside the database and returns at most one row per activity or station. That
 * is why this file exists separately from `scans.ts` and `swag.ts`, whose readers all return
 * records — on a day with four thousand scans, a panel that refreshes itself must not pull
 * four thousand rows across the one serialized connection (ADR-003) in order to count them
 * in JavaScript.
 */

export interface StationActivityRow {
  stationId: string;
  /** Events recorded at this station inside the window. */
  recentCount: number;
  /** The most recent event at this station EVER, not just inside the window. */
  lastEventAt: Date | null;
}

/**
 * Live scans only. A voided scan is a thing that was taken back, and counting it would make
 * a station that spent ten minutes correcting itself look like a station that was busy.
 */
export async function countRecentScansByActivity(
  db: Executor,
  since: Date,
): Promise<StationActivityRow[]> {
  return db
    .select({
      stationId: fringeScans.activityId,
      recentCount: sql<number>`count(*) FILTER (WHERE ${fringeScans.scannedAt} >= ${since})::int`,
      lastEventAt: max(fringeScans.scannedAt),
    })
    .from(fringeScans)
    .where(not(fringeScans.isVoided))
    .groupBy(fringeScans.activityId);
}

/**
 * ADR-159 — live claims only, for the reason the fringe twin above already gives. Until a
 * claim could be voided there was nothing to exclude; now a counter that spent ten minutes
 * taking handouts back would otherwise read as a counter that was busy.
 */
export async function countRecentClaimsByStation(
  db: Executor,
  since: Date,
): Promise<StationActivityRow[]> {
  return db
    .select({
      stationId: swagClaims.stationId,
      recentCount: sql<number>`count(*) FILTER (WHERE ${swagClaims.claimedAt} >= ${since})::int`,
      lastEventAt: max(swagClaims.claimedAt),
    })
    .from(swagClaims)
    .where(not(swagClaims.isVoided))
    .groupBy(swagClaims.stationId);
}

export interface OpenRoundRow {
  stationId: string;
  stationName: string;
  roundNumber: number;
  openedAt: Date;
}

/**
 * `open` only, not `ended`. Both are "active" to the single-active-round index, but a round
 * that has ended is one whose marshal is awarding places — silence there is the expected
 * state, and flagging it would teach the superadmin to ignore the flag.
 */
export async function listOpenFringeRounds(db: Executor): Promise<OpenRoundRow[]> {
  return db
    .select({
      stationId: fringeRounds.activityId,
      stationName: fringeActivities.activityName,
      roundNumber: fringeRounds.roundNumber,
      openedAt: fringeRounds.openedAt,
    })
    .from(fringeRounds)
    .innerJoin(fringeActivities, eq(fringeActivities.id, fringeRounds.activityId))
    .where(eq(fringeRounds.status, 'open'));
}

export async function listOpenSwagRounds(db: Executor): Promise<OpenRoundRow[]> {
  return db
    .select({
      stationId: swagRounds.stationId,
      stationName: swagStations.stationName,
      roundNumber: swagRounds.roundNumber,
      openedAt: swagRounds.openedAt,
    })
    .from(swagRounds)
    .innerJoin(swagStations, eq(swagStations.id, swagRounds.stationId))
    .where(eq(swagRounds.status, 'open'));
}
