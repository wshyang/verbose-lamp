import type { OperationsOverviewView } from '@psd/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { flushPresence, resetPresence } from '../lib/presence.js';
import {
  createTestContext,
  jsonRequest,
  seedFringeReady,
  type ActorSession,
  type TestContext,
} from './harness.js';

/**
 * ADR-151 — the operations overview: the last fifteen minutes.
 *
 * What these tests are actually about is the difference between a number that is true and a
 * number that is useful. The dashboard above this panel has always been able to say how many
 * scans there have ever been; none of it could say whether anything was happening right now,
 * and that is the only question anybody asks from the laptop between 09:00 and 16:00.
 */

interface Payload {
  overview: OperationsOverviewView;
}

describe('the operations overview (ADR-151)', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
  });

  afterAll(async () => {
    resetPresence();
    await ctx.close();
  });

  async function overview(): Promise<OperationsOverviewView> {
    const response = await ctx.app.request('/api/admin/operations', {
      headers: superadmin.headers,
    });
    expect(response.status).toBe(200);
    return (await ctx.json<Payload>(response)).overview;
  }

  /** The only way to make "fifteen minutes ago" happen inside a test that takes two seconds. */
  async function backdateRound(roundId: string, minutes: number): Promise<void> {
    await ctx.handle.db.execute(
      sql`UPDATE fringe_round SET opened_at = now() - make_interval(mins => ${minutes})
          WHERE id = ${roundId}::uuid`,
    );
  }

  it('counts the window, not the day', async () => {
    const fringe = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname: participant.nickname,
          roundId: fringe.roundId,
          tierLabel: fringe.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        fringe.facilitator.headers,
      ),
    );

    const view = await overview();
    expect(view.windowMinutes).toBe(15);
    expect(view.scanCount).toBe(1);
    const station = view.stations.find((row) => row.id === fringe.activityId);
    expect(station?.recentCount).toBe(1);
    expect(station?.openRoundNumber).toBe(1);
    expect(station?.lastEventAt).not.toBeNull();
  });

  it('does not count a scan that was taken back', async () => {
    const fringe = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const scanned = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname: participant.nickname,
          roundId: fringe.roundId,
          tierLabel: fringe.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        fringe.facilitator.headers,
      ),
    );
    const { scan } = await ctx.json<{ scan: { id: string } }>(scanned);
    const before = (await overview()).scanCount;

    await ctx.app.request(
      `/api/admin/scans/${scan.id}/void`,
      jsonRequest({ reason: 'wrong participant' }, superadmin.headers),
    );

    /*
     * A station that spent ten minutes correcting itself is not a busy station, and showing
     * it as one would make the panel agree with the marshal's mistake.
     */
    expect((await overview()).scanCount).toBe(before - 1);
  });

  it('flags a station whose round has been open all window with nothing happening', async () => {
    const fringe = await seedFringeReady(ctx);
    await backdateRound(fringe.roundId, 40);

    const station = (await overview()).stations.find((row) => row.id === fringe.activityId);
    // The one thing this panel exists to surface: the activity either finished and nobody
    // closed the round, or the marshal's phone is dead, and from the laptop those look
    // exactly alike until somebody walks over.
    expect(station?.isQuiet).toBe(true);
    expect(station?.lastEventAt).toBeNull();
  });

  it('does not flag a round that has only just opened', async () => {
    const fringe = await seedFringeReady(ctx);

    // Ninety seconds in with no scans is a marshal getting started. Calling that a problem
    // would teach the superadmin to ignore the mark by half past nine.
    const station = (await overview()).stations.find((row) => row.id === fringe.activityId);
    expect(station?.isQuiet).toBe(false);
  });

  it('puts the quiet stations first, because they are the reason to read the panel', async () => {
    const quiet = await seedFringeReady(ctx);
    await backdateRound(quiet.roundId, 40);
    const busy = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname: participant.nickname,
          roundId: busy.roundId,
          tierLabel: busy.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        busy.facilitator.headers,
      ),
    );

    const stations = (await overview()).stations;
    const firstBusy = stations.findIndex((row) => !row.isQuiet);
    const lastQuiet = stations.map((row) => row.isQuiet).lastIndexOf(true);
    expect(lastQuiet).toBeLessThan(firstBusy);
  });

  it('watches the swag counter on exactly the same terms as a fringe activity', async () => {
    const created = await ctx.app.request(
      '/api/admin/swag-stations',
      jsonRequest(
        {
          stationName: `Goodie Counter ${ctx.runId.slice(0, 6)}`,
          items: [{ label: 'Tote bag', limit: 1 }],
        },
        superadmin.headers,
      ),
    );
    const { station } = await ctx.json<{ station: { id: string } }>(created);
    const facilitator = await ctx.createFacilitator();
    const opened = await ctx.app.request(
      `/api/swag/stations/${station.id}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    const { round } = await ctx.json<{ round: { id: string } }>(opened);
    const participant = await ctx.signUpParticipant();
    await ctx.app.request(
      '/api/swag/claims',
      jsonRequest(
        {
          nickname: participant.nickname,
          roundId: round.id,
          itemLabel: 'Tote bag',
          clientClaimUuid: crypto.randomUUID(),
        },
        facilitator.headers,
      ),
    );

    const view = await overview();
    const counter = view.stations.find((row) => row.id === station.id);
    /*
     * The swag counter is a station with a round and a queue, exactly like a fringe
     * activity, and the superadmin's question about it is identical. Giving it its own
     * panel would have been two things to read instead of one list to scan.
     */
    expect(counter?.kind).toBe('swag');
    expect(counter?.recentCount).toBe(1);
    expect(counter?.openRoundNumber).toBe(1);
    expect(view.claimCount).toBeGreaterThanOrEqual(1);
  });

  it('pins the tournament-removed stub fields: no live matches, no teams outside', async () => {
    const view = await overview();
    expect(view.liveMatches).toEqual([]);
    expect(view.teamsOutside).toEqual({ count: 0, canAdmit: false });
    expect(view.matchesCompleted).toBe(0);
    expect(view.matchMinutes).toBeGreaterThan(0);
  });

  it('tells a marshal who is working from one who has never opened the app', async () => {
    const fringe = await seedFringeReady(ctx);
    // Created, and that is all: an account a superadmin set up last night for somebody who
    // has not turned up. Signing in is not the same as being here — the sign-in route
    // stamps `last_login_at`, and nothing else has ever recorded the difference.
    const absent = await ctx.createFacilitator();
    // Presence is a note in memory until the flusher runs (ADR-082); the fringe facilitator
    // opened a round, so their id is pending.
    await flushPresence(ctx.handle.db);

    const view = await overview();
    const working = view.facilitators.find((row) => row.id === fringe.facilitator.id);
    expect(working?.isActive).toBe(true);
    expect(working?.lastSeenAt).not.toBeNull();

    const missing = view.facilitators.find((row) => row.id === absent.id);
    expect(missing?.isActive).toBe(false);
    // Null, not a timestamp from the moment the account was made: the panel must be able to
    // say "not once, all day", and a defaulted column would have said "08:02" instead.
    expect(missing?.lastSeenAt).toBeNull();
  });

  it('shows a facilitator who has not been seen inside the window as inactive', async () => {
    const fringe = await seedFringeReady(ctx);
    await flushPresence(ctx.handle.db);
    await ctx.handle.db.execute(
      sql`UPDATE facilitator_account SET last_seen_at = now() - make_interval(mins => 90)
          WHERE id = ${fringe.facilitator.id}::uuid`,
    );

    const stale = (await overview()).facilitators.find((row) => row.id === fringe.facilitator.id);
    // Still listed, with the time they were last heard from: "gone" is the answer, and the
    // timestamp is what lets the superadmin judge whether it matters.
    expect(stale?.isActive).toBe(false);
    expect(stale?.lastSeenAt).not.toBeNull();
  });

  it('is superadmin-only: the marshals do not get a view of each other', async () => {
    const fringe = await seedFringeReady(ctx);
    const refused = await ctx.app.request('/api/admin/operations', {
      headers: fringe.facilitator.headers,
    });
    expect(refused.status).toBe(403);
    const anonymous = await ctx.app.request('/api/admin/operations');
    expect(anonymous.status).toBe(401);
  });
});

