import type { ActivityView, PassportView, ScanView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activityNameFor } from './fixtures/names.js';
import {
  createTestContext,
  jsonRequest,
  type ActorSession,
  type TestContext,
} from './harness.js';

/**
 * ADR-239 — the passport tab on Scan History.
 *
 * A station is COMPLETED for a participant when they hold at least one counted scan there.
 * "Counted" is the test the points and the passport bonus already make (ADR-176): a voided
 * scan and a scan undone at the station are both off the board, so neither completes it.
 *
 * The list is every station the day has, not only the ones this person has visited. An empty
 * slot is what tells somebody there is still one to go.
 */

const TIER = 'Award';
const TIER_POINTS = 5;
const STATION_COUNT = 3;

let ctx: TestContext;
let superadmin: ActorSession;
let facilitator: ActorSession;
const activityIds: string[] = [];
/** Index-aligned with `activityIds`: the round that is open at each station right now. */
const roundIds: string[] = [];

beforeAll(async () => {
  ctx = await createTestContext();
  superadmin = await ctx.signInSuperadmin();
  facilitator = await ctx.createFacilitator();
  for (let index = 0; index < STATION_COUNT; index += 1) {
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
});

afterAll(async () => {
  await ctx.close();
});

async function openRound(activityId: string): Promise<string> {
  const response = await ctx.app.request(
    `/api/fringe/activities/${activityId}/rounds`,
    jsonRequest({}, facilitator.headers),
  );
  expect(response.status).toBe(201);
  const { round } = await ctx.json<{ round: { id: string } }>(response);
  return round.id;
}

async function advance(roundId: string): Promise<string> {
  const response = await ctx.app.request(
    `/api/fringe/rounds/${roundId}/advance`,
    jsonRequest({}, facilitator.headers),
  );
  expect(response.status).toBe(201);
  const { round } = await ctx.json<{ round: { id: string } }>(response);
  return round.id;
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

async function passportFor(session: ActorSession): Promise<PassportView> {
  const response = await ctx.app.request('/api/me/passport', { headers: session.headers });
  expect(response.status).toBe(200);
  return ctx.json<PassportView>(response);
}

/** The stations this person has completed, by id, in the order the list gives them. */
function completedIds(passport: PassportView): string[] {
  return passport.stations.filter((station) => station.isCompleted).map((station) => station.activityId);
}

describe('ADR-239 — the passport tab (Scan History)', () => {
  it('lists every station in the facilitators’ order, and completes only the ones stamped', async () => {
    const walker = await ctx.signUpParticipant();
    await stamp(walker.nickname, roundIds[0] as string);

    const passport = await passportFor(walker);
    const facilitatorList = await ctx.json<{ items: ActivityView[] }>(
      await ctx.app.request('/api/fringe/activities', { headers: facilitator.headers }),
    );

    expect(passport.stations.map((station) => station.activityId)).toEqual(
      facilitatorList.items.map((activity) => activity.id),
    );
    expect(passport.stations).toHaveLength(STATION_COUNT);
    expect(completedIds(passport)).toEqual([activityIds[0]]);
    expect(passport.stations[0]?.activityName).toBe(facilitatorList.items[0]?.activityName);
  });

  it('counts a station once, however many rounds were scanned there', async () => {
    const loiterer = await ctx.signUpParticipant();
    await stamp(loiterer.nickname, roundIds[1] as string);
    const nextRound = await advance(roundIds[1] as string);
    roundIds[1] = nextRound;
    await stamp(loiterer.nickname, nextRound);

    const passport = await passportFor(loiterer);
    expect(completedIds(passport)).toEqual([activityIds[1]]);
  });

  /*
   * ADR-261 — completion is still counted once per station, but the passport also hears HOW
   * MANY counted scans stand behind it: each round at a known station strikes another chop.
   * A voided stamp takes its strike back; the chop count is the counted scans, no more.
   */
  it('reports how many rounds stand behind a station, and a void takes one back', async () => {
    const regular = await ctx.signUpParticipant();
    await stamp(regular.nickname, roundIds[0] as string);
    roundIds[0] = await advance(roundIds[0] as string);
    await stamp(regular.nickname, roundIds[0]);
    roundIds[0] = await advance(roundIds[0] as string);
    const third = await stamp(regular.nickname, roundIds[0]);

    const atStation = (passport: PassportView) =>
      passport.stations.find((station) => station.activityId === activityIds[0]);
    let station = atStation(await passportFor(regular));
    expect(station?.isCompleted).toBe(true);
    expect(station?.completions).toBe(3);
    expect(completedIds(await passportFor(regular))).toEqual([activityIds[0]]);

    const voided = await ctx.app.request(
      `/api/admin/scans/${third.id}/void`,
      jsonRequest({ reason: 'Stamped twice by mistake' }, superadmin.headers),
    );
    expect(voided.status).toBe(200);
    station = atStation(await passportFor(regular));
    expect(station?.completions).toBe(2);
  });

  it('does not complete a station for a stamp that has since been voided', async () => {
    const voider = await ctx.signUpParticipant();
    const scan = await stamp(voider.nickname, roundIds[2] as string);
    expect(completedIds(await passportFor(voider))).toEqual([activityIds[2]]);

    const voided = await ctx.app.request(
      `/api/admin/scans/${scan.id}/void`,
      jsonRequest({ reason: 'Stamped at the wrong station' }, superadmin.headers),
    );
    expect(voided.status).toBe(200);
    expect(completedIds(await passportFor(voider))).toEqual([]);
  });

  it('does not complete a station for a stamp the station undid', async () => {
    const undoer = await ctx.signUpParticipant();
    const scan = await stamp(undoer.nickname, roundIds[0] as string);
    const undone = await ctx.app.request(
      `/api/fringe/scans/${scan.id}/undo`,
      jsonRequest({}, facilitator.headers),
    );
    expect(undone.status).toBe(200);
    expect(completedIds(await passportFor(undoer))).toEqual([]);
  });

  it('shows nobody’s stamps but the participant’s own, whatever id is supplied', async () => {
    const stranger = await ctx.signUpParticipant();
    const other = await ctx.signUpParticipant();
    await stamp(other.nickname, roundIds[0] as string);

    const own = await ctx.app.request(`/api/me/passport?participantId=${other.id}`, {
      headers: stranger.headers,
    });
    expect(completedIds(await ctx.json<PassportView>(own))).toEqual([]);
    expect(completedIds(await passportFor(other))).toContain(activityIds[0]);
  });

  it('refuses a facilitator or superadmin session, which is the wrong party for a passport', async () => {
    const asFacilitator = await ctx.app.request('/api/me/passport', { headers: facilitator.headers });
    const asSuperadmin = await ctx.app.request('/api/me/passport', { headers: superadmin.headers });
    expect(asFacilitator.status).toBe(403);
    expect(asSuperadmin.status).toBe(403);
  });
});
