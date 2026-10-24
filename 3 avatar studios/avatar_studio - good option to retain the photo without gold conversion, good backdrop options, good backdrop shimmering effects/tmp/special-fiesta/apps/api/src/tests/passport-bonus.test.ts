import type { LeaderboardView, ParticipantTotalsView, ScanView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  jsonRequest,
  type ActorSession,
  type TestContext,
} from './harness.js';
import { activityNameFor } from './fixtures/names.js';
import { resetCachesForTests } from '../lib/cache.js';

/**
 * ADR-176 — the passport bonus: one payment for visiting enough DISTINCT stations.
 *
 * The easy assertion is "four stamps paid twenty". The ones worth writing are the other
 * direction, because a passport is a threshold and a threshold can be crossed backwards:
 * void a stamp and the bonus must disappear on the next read with nobody writing a
 * compensating row. That is the whole reason it is derived (ADR-006) rather than stored, so
 * a test that never voids anything would not be testing the design at all.
 *
 * The other trap is counting. Two rounds at one station are two scans and one stamp; a
 * passport that could be filled by queueing at the same table four times is not a passport.
 */

const BONUS = 20;
const STATIONS_REQUIRED = 4;
const TIER = 'Award';
const TIER_POINTS = 5;

let ctx: TestContext;
let superadmin: ActorSession;
let facilitator: ActorSession;
/** Five stations, so the day always has one more than the passport needs. */
const activityIds: string[] = [];
const roundIds: string[] = [];

beforeAll(async () => {
  ctx = await createTestContext();
  superadmin = await ctx.signInSuperadmin();
  facilitator = await ctx.createFacilitator();
  for (let i = 0; i < 5; i += 1) {
    const created = await ctx.app.request(
      '/api/admin/activities',
      jsonRequest(
        {
          activityName: activityNameFor(ctx.runId),
          awardTiers: [{ label: TIER, points: TIER_POINTS }],
        },
        superadmin.headers,
      ),
    );
    const { activity } = await ctx.json<{ activity: { id: string } }>(created);
    activityIds.push(activity.id);
    roundIds.push(await openRound(activity.id));
  }
  await setPassport({ bonus: BONUS, stations: STATIONS_REQUIRED });
});

afterAll(async () => {
  await ctx.close();
});

/** Index into the seeded rounds, loudly rather than as undefined if the fixture is short. */
function roundAt(index: number): string {
  const id = roundIds[index];
  if (id === undefined) throw new Error(`No seeded round at index ${index}`);
  return id;
}

async function openRound(activityId: string): Promise<string> {
  const response = await ctx.app.request(
    `/api/fringe/activities/${activityId}/rounds`,
    jsonRequest({}, facilitator.headers),
  );
  const { round } = await ctx.json<{ round: { id: string } }>(response);
  return round.id;
}

/** The passport pair is saved through the same config route as every other point value. */
async function setPassport(input: { bonus: number; stations: number }): Promise<void> {
  const response = await ctx.app.request('/api/admin/point-config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...superadmin.headers },
    body: JSON.stringify({
      tournamentWinPoints: 30,
      tournamentLossPoints: 10,
      fringePassportBonusPoints: input.bonus,
      fringePassportStations: input.stations,
    }),
  });
  expect(response.status).toBe(200);
}

async function stamp(nickname: string, roundId: string): Promise<ScanView> {
  const response = await ctx.app.request(
    '/api/fringe/scans',
    jsonRequest(
      {
        nickname,
        roundId,
        tierLabel: TIER,
        clientScanUuid: crypto.randomUUID(),
        clientTimestamp: new Date().toISOString(),
      },
      facilitator.headers,
    ),
  );
  expect(response.status).toBe(201);
  const { scan } = await ctx.json<{ scan: ScanView }>(response);
  return scan;
}

/**
 * The board is memoised (ADR-038) and this whole feature is a question the board answers, so
 * every read here drops the cache first. A derived bonus that is actually stale would other-
 * wise look exactly like a derived bonus that is correct.
 */
async function pointsFor(participantId: string): Promise<number> {
  resetCachesForTests();
  const { topIndividuals } = await ctx.json<LeaderboardView>(
    await ctx.app.request('/api/leaderboard', { headers: superadmin.headers }),
  );
  return topIndividuals.find((entry) => entry.participantId === participantId)?.totalPoints ?? 0;
}

async function totalsFor(session: ActorSession): Promise<ParticipantTotalsView> {
  resetCachesForTests();
  const { totals } = await ctx.json<{ totals: ParticipantTotalsView }>(
    await ctx.app.request('/api/me', { headers: session.headers }),
  );
  return totals;
}

describe('ADR-176 — the passport bonus', () => {
  it('pays once the fourth DISTINCT station is stamped, and not before', async () => {
    const walker = await ctx.signUpParticipant();
    for (let i = 0; i < 3; i += 1) await stamp(walker.nickname, roundAt(i));
    expect(await pointsFor(walker.id)).toBe(3 * TIER_POINTS);

    await stamp(walker.nickname, roundAt(3));
    expect(await pointsFor(walker.id)).toBe(4 * TIER_POINTS + BONUS);
  });

  it('pays the bonus once, not again for the fifth station', async () => {
    const walker = await ctx.signUpParticipant();
    for (let i = 0; i < 5; i += 1) await stamp(walker.nickname, roundAt(i));
    expect(await pointsFor(walker.id)).toBe(5 * TIER_POINTS + BONUS);
  });

  it('counts stations, not scans: four visits to one station earn no passport', async () => {
    const loiterer = await ctx.signUpParticipant();
    // Four scans at the SAME activity, each in its own round so none is a duplicate.
    let roundId = roundAt(0);
    for (let round = 0; round < 4; round += 1) {
      await stamp(loiterer.nickname, roundId);
      roundId = await advance(roundId);
    }
    roundIds[0] = roundId;
    const totals = await totalsFor(loiterer);
    expect(totals.scanCount).toBe(4);
    expect(totals.passport.stationsVisited).toBe(1);
    expect(totals.passport.isEarned).toBe(false);
    expect(await pointsFor(loiterer.id)).toBe(4 * TIER_POINTS);
  });

  it('WITHDRAWS the bonus when a void drops the walker back below the threshold', async () => {
    const walker = await ctx.signUpParticipant();
    const firstStamp = await stamp(walker.nickname, roundAt(0));
    for (let i = 1; i < 4; i += 1) await stamp(walker.nickname, roundAt(i));
    expect(await pointsFor(walker.id)).toBe(4 * TIER_POINTS + BONUS);

    const voided = await ctx.app.request(
      `/api/admin/scans/${firstStamp.id}/void`,
      jsonRequest({ reason: 'Stamped at the wrong station' }, superadmin.headers),
    );
    expect(voided.status).toBe(200);

    // Three stamps and no bonus — with no compensating write anywhere (ADR-006).
    expect(await pointsFor(walker.id)).toBe(3 * TIER_POINTS);
    expect((await totalsFor(walker)).passport.isEarned).toBe(false);
  });

  it('re-pays the bonus when the void is reversed', async () => {
    const walker = await ctx.signUpParticipant();
    const firstStamp = await stamp(walker.nickname, roundAt(0));
    for (let i = 1; i < 4; i += 1) await stamp(walker.nickname, roundAt(i));
    await ctx.app.request(
      `/api/admin/scans/${firstStamp.id}/void`,
      jsonRequest({ reason: 'Stamped at the wrong station' }, superadmin.headers),
    );
    expect(await pointsFor(walker.id)).toBe(3 * TIER_POINTS);

    const unvoided = await ctx.app.request(
      `/api/admin/scans/${firstStamp.id}/unvoid`,
      jsonRequest({ reason: 'Void was a mistake; the stamp was good' }, superadmin.headers),
    );
    expect(unvoided.status).toBe(200);
    expect(await pointsFor(walker.id)).toBe(4 * TIER_POINTS + BONUS);
  });

  it('reports progress toward the passport before it is earned', async () => {
    const walker = await ctx.signUpParticipant();
    await stamp(walker.nickname, roundAt(0));
    await stamp(walker.nickname, roundAt(1));
    const totals = await totalsFor(walker);
    expect(totals.passport).toEqual({
      stationsVisited: 2,
      stationsRequired: STATIONS_REQUIRED,
      bonusPoints: BONUS,
      isEarned: false,
    });
  });

  it('is off entirely when the bonus is zero, and comes back when it is restored', async () => {
    const walker = await ctx.signUpParticipant();
    for (let i = 0; i < 4; i += 1) await stamp(walker.nickname, roundAt(i));
    expect(await pointsFor(walker.id)).toBe(4 * TIER_POINTS + BONUS);

    await setPassport({ bonus: 0, stations: STATIONS_REQUIRED });
    expect(await pointsFor(walker.id)).toBe(4 * TIER_POINTS);
    expect((await totalsFor(walker)).passport.isEarned).toBe(false);

    await setPassport({ bonus: BONUS, stations: STATIONS_REQUIRED });
    expect(await pointsFor(walker.id)).toBe(4 * TIER_POINTS + BONUS);
  });

  it('re-prices every passport when the threshold moves, because it is derived', async () => {
    const walker = await ctx.signUpParticipant();
    for (let i = 0; i < 4; i += 1) await stamp(walker.nickname, roundAt(i));
    expect(await pointsFor(walker.id)).toBe(4 * TIER_POINTS + BONUS);

    // Raising the bar above what this walker has done takes the bonus away again.
    await setPassport({ bonus: BONUS, stations: 5 });
    expect(await pointsFor(walker.id)).toBe(4 * TIER_POINTS);

    await setPassport({ bonus: BONUS, stations: STATIONS_REQUIRED });
    expect(await pointsFor(walker.id)).toBe(4 * TIER_POINTS + BONUS);
  });
});

/** ADR-092 — close this round and open the next at the same station, returning the new id. */
async function advance(roundId: string): Promise<string> {
  const response = await ctx.app.request(
    `/api/fringe/rounds/${roundId}/advance`,
    jsonRequest({}, facilitator.headers),
  );
  expect(response.status).toBe(201);
  const { round } = await ctx.json<{ round: { id: string } }>(response);
  return round.id;
}
