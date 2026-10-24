import type { LeaderboardView, ScanView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  jsonRequest,
  seedFringeReady,
  type TestContext,
  withMethod,
} from './harness.js';

describe('F43–F46, F50 — superadmin corrections and the audit trail', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function scoredScan() {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname: participant.nickname,
          roundId: fixture.roundId,
          tierLabel: fixture.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        fixture.facilitator.headers,
      ),
    );
    const { scan } = await ctx.json<{ scan: ScanView }>(response);
    return { fixture, participant, scan };
  }

  async function clusterPoints(headers: Record<string, string>, clusterCode: string) {
    const response = await ctx.app.request('/api/leaderboard', { headers });
    const board = await ctx.json<LeaderboardView>(response);
    return board.clusters.find((row) => row.clusterCode === clusterCode)?.totalPoints ?? 0;
  }

  it('F46: voiding a scan excludes it from scoring and is reversible', async () => {
    const { fixture, participant, scan } = await scoredScan();
    const before = await clusterPoints(fixture.superadmin.headers, participant.clusterCode);

    await ctx.app.request(
      `/api/admin/scans/${scan.id}/void`,
      jsonRequest({ reason: 'Double counted at the station' }, fixture.superadmin.headers),
    );
    const during = await clusterPoints(fixture.superadmin.headers, participant.clusterCode);
    expect(during).toBe(before - scan.pointsAwardedSnapshot);

    await ctx.app.request(
      `/api/admin/scans/${scan.id}/unvoid`,
      jsonRequest({ reason: 'Station confirmed the scan was genuine' }, fixture.superadmin.headers),
    );
    const after = await clusterPoints(fixture.superadmin.headers, participant.clusterCode);
    expect(after).toBe(before);
  });

  it('S52: participant detail shows totals, team and every scan', async () => {
    const { fixture, participant, scan } = await scoredScan();
    const response = await ctx.app.request(`/api/admin/participants/${participant.id}`, {
      headers: fixture.superadmin.headers,
    });
    expect(response.status).toBe(200);
    const body = await ctx.json<{
      participant: { nickname: string };
      totals: { totalPoints: number };
      scans: ScanView[];
    }>(response);
    expect(body.participant.nickname).toBe(participant.nickname);
    expect(body.totals.totalPoints).toBe(scan.pointsAwardedSnapshot);
    expect(body.scans).toHaveLength(1);
  });

  it('S35: the dashboard reports bootstrap progress (§8.1)', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const response = await ctx.app.request('/api/admin/dashboard', { headers: superadmin.headers });
    const body = await ctx.json<{ status: { isPointConfigSet: boolean; courtCount: number } }>(
      response,
    );
    expect(body.status.isPointConfigSet).toBe(false);
    expect(body.status.courtCount).toBe(0);
  });

  it('F40: a superadmin can reset a facilitator passcode and assign a default station', async () => {
    const fixture = await seedFringeReady(ctx);
    const facilitators = await ctx.app.request('/api/admin/facilitators', {
      headers: fixture.superadmin.headers,
    });
    const list = await ctx.json<{ items: { id: string; username: string }[] }>(facilitators);
    const target = list.items.find((item) => item.username === fixture.facilitator.username);
    expect(target).toBeDefined();

    const response = await ctx.app.request(
      `/api/admin/facilitators/${target?.id}`,
      withMethod(
        'PUT',
        {
          passcode: '7777',
          defaultStationType: 'fringe_activity',
          defaultStationId: fixture.activityId,
        },
        fixture.superadmin.headers,
      ),
    );
    expect(response.status).toBe(200);
    const body = await ctx.json<{ facilitator: { defaultStationLabel: string | null } }>(response);
    expect(body.facilitator.defaultStationLabel).not.toBeNull();

    const signIn = await ctx.app.request(
      '/api/auth/facilitators/signin',
      jsonRequest({ username: fixture.facilitator.username, passcode: '7777' }),
    );
    expect(signIn.status).toBe(200);
  });

  it('S33/S56: facilitators and superadmins can both reset a participant PIN', async () => {
    const participant = await ctx.signUpParticipant({ pin: '1234' });
    const facilitator = await ctx.createFacilitator();
    const superadmin = await ctx.signInSuperadmin();

    const byFacilitator = await ctx.app.request(
      `/api/staff/participants/${participant.id}/pin`,
      withMethod('PUT', { pin: '5555' }, facilitator.headers),
    );
    expect(byFacilitator.status).toBe(200);
    const bySuperadmin = await ctx.app.request(
      `/api/staff/participants/${participant.id}/pin`,
      withMethod('PUT', { pin: '6666' }, superadmin.headers),
    );
    expect(bySuperadmin.status).toBe(200);

    const resumed = await ctx.app.request(
      '/api/auth/participants/signin',
      jsonRequest({ nickname: participant.nickname, pin: '6666' }),
    );
    expect(resumed.status).toBe(200);
  });
});
