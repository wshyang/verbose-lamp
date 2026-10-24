import { messages } from '@psd/contracts';
import type { ActivityView, PointConfigView, RoundView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  jsonRequest,
  withMethod,
  type ActorSession,
  type TestContext,
} from './harness.js';

/**
 * F33–F38 — the superadmin configuration surfaces (S36–S43).
 *
 * These are the bootstrap gates B4–B6: without point values there is no tournament, without
 * an enabled court there is nowhere to play, without an active activity there is nothing to
 * scan. Each one is tested through the real router with a real superadmin session.
 */

interface ErrorBody {
  error: { message: string; field?: string };
}

describe('F33–F38 — point config, activities and courts', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const asAdmin = () => ({ headers: superadmin.headers });

  async function createActivity(name: string, pointValue = 10) {
    const response = await ctx.app.request(
      '/api/admin/activities',
      jsonRequest(
        { activityName: name, awardTiers: [{ label: 'Award', points: pointValue }] },
        superadmin.headers,
      ),
    );
    const body = await ctx.json<{ activity: ActivityView }>(response);
    return { status: response.status, activity: body.activity };
  }

  it('F33 — starts unset, then stores the fringe point values', async () => {
    const before = await ctx.app.request('/api/admin/point-config', asAdmin());
    expect(await ctx.json<{ pointConfig: PointConfigView | null }>(before)).toEqual({
      pointConfig: null,
    });

    const saved = await ctx.app.request(
      '/api/admin/point-config',
      withMethod(
        'PUT',
        { fringeParticipationPoints: 5, fringePassportBonusPoints: 3, fringePassportStations: 10 },
        superadmin.headers,
      ),
    );
    expect(saved.status).toBe(200);

    const after = await ctx.app.request('/api/admin/point-config', asAdmin());
    const { pointConfig } = await ctx.json<{ pointConfig: PointConfigView }>(after);
    expect(pointConfig.fringeParticipationPoints).toBe(5);
    expect(pointConfig.fringePassportBonusPoints).toBe(3);
    expect(pointConfig.fringePassportStations).toBe(10);
    expect(pointConfig.updatedByUsername).toBe('superadmin');
  });

  it('F33 — rewrites the singleton instead of inserting a second row', async () => {
    await ctx.app.request(
      '/api/admin/point-config',
      withMethod(
        'PUT',
        { fringeParticipationPoints: 7, fringePassportBonusPoints: 2, fringePassportStations: 5 },
        superadmin.headers,
      ),
    );
    const response = await ctx.app.request('/api/admin/point-config', asAdmin());
    const { pointConfig } = await ctx.json<{ pointConfig: PointConfigView }>(response);
    expect(pointConfig.fringeParticipationPoints).toBe(7);
  });

  it('F33 — participation points must be at least 1 (fds.md §2.12)', async () => {
    const zero = await ctx.app.request(
      '/api/admin/point-config',
      withMethod('PUT', { fringeParticipationPoints: 0 }, superadmin.headers),
    );
    expect(zero.status).toBe(400);
    const body = await ctx.json<ErrorBody>(zero);
    expect(body.error.message).toBe(messages.participationPointsInvalid);
  });

  it('F34/F35 — creates an activity, then edits every field', async () => {
    const created = await createActivity(`Tug of War ${ctx.runId}`, 15);
    expect(created.status).toBe(201);
    expect(created.activity.awardTiers).toEqual([{ label: 'Award', points: 15 }]);
    expect(created.activity.currentRound).toBeNull();

    const edited = await ctx.app.request(
      `/api/admin/activities/${created.activity.id}`,
      withMethod(
        'PUT',
        {
          activityName: `Tug of War Deluxe ${ctx.runId}`,
          awardTiers: [
            { label: 'First place', points: 25 },
            { label: 'Second place', points: 10 },
          ],
          isActive: true,
        },
        superadmin.headers,
      ),
    );
    const { activity } = await ctx.json<{ activity: ActivityView }>(edited);
    expect(activity.activityName).toBe(`Tug of War Deluxe ${ctx.runId}`);
    expect(activity.awardTiers).toEqual([
      { label: 'First place', points: 25 },
      { label: 'Second place', points: 10 },
    ]);
  });

  it('ADR-092 — refuses tier lists that break the contract', async () => {
    const dup = await ctx.app.request(
      '/api/admin/activities',
      jsonRequest(
        {
          activityName: `Dup Tiers ${ctx.runId}`,
          awardTiers: [
            { label: 'First', points: 5 },
            { label: 'first', points: 3 },
          ],
        },
        superadmin.headers,
      ),
    );
    expect(dup.status).toBe(400);
    expect((await ctx.json<ErrorBody>(dup)).error.message).toBe(messages.tierListInvalid);

    const zeroPoints = await ctx.app.request(
      '/api/admin/activities',
      jsonRequest(
        { activityName: `Zero Tier ${ctx.runId}`, awardTiers: [{ label: 'First', points: 0 }] },
        superadmin.headers,
      ),
    );
    expect(zeroPoints.status).toBe(400);
    expect((await ctx.json<ErrorBody>(zeroPoints)).error.message).toBe(messages.tierPointsInvalid);
  });

  it('F34 — refuses a duplicate activity name, case-insensitively', async () => {
    const name = `Sandcastle ${ctx.runId}`;
    await createActivity(name);
    const again = await ctx.app.request(
      '/api/admin/activities',
      jsonRequest(
        { activityName: name.toUpperCase(), awardTiers: [{ label: 'Award', points: 5 }] },
        superadmin.headers,
      ),
    );
    expect(again.status).toBe(409);
    expect((await ctx.json<ErrorBody>(again)).error.message).toBe(messages.activityNameInvalid);
  });

  it('F35 — refuses to rename an activity onto another activity name', async () => {
    const first = await createActivity(`Relay ${ctx.runId}`);
    const second = await createActivity(`Frisbee ${ctx.runId}`);
    const clash = await ctx.app.request(
      `/api/admin/activities/${second.activity.id}`,
      withMethod(
        'PUT',
        {
          activityName: `Relay ${ctx.runId}`,
          awardTiers: [{ label: 'Award', points: 10 }],
          isActive: true,
        },
        superadmin.headers,
      ),
    );
    expect(clash.status).toBe(409);
    expect(first.activity.id).not.toBe(second.activity.id);
  });

  it('F35/F36 — 404s on an unknown activity for both edit and toggle', async () => {
    const missing = '00000000-0000-7000-8000-000000000000';
    const edit = await ctx.app.request(
      `/api/admin/activities/${missing}`,
      withMethod(
        'PUT',
        { activityName: 'Ghost', awardTiers: [{ label: 'Award', points: 10 }], isActive: true },
        superadmin.headers,
      ),
    );
    const toggle = await ctx.app.request(
      `/api/admin/activities/${missing}/active`,
      withMethod('PATCH', { isEnabled: false }, superadmin.headers),
    );
    expect([edit.status, toggle.status]).toEqual([404, 404]);
  });

  it('F36 — deactivating closes the open round; reactivating leaves it closed', async () => {
    const { activity } = await createActivity(`Limbo ${ctx.runId}`, 8);
    const facilitator = await ctx.createFacilitator();
    const opened = await ctx.app.request(
      `/api/fringe/activities/${activity.id}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    expect(opened.status).toBe(201);

    const deactivated = await ctx.app.request(
      `/api/admin/activities/${activity.id}/active`,
      withMethod('PATCH', { isEnabled: false }, superadmin.headers),
    );
    const closed = await ctx.json<{ activity: ActivityView }>(deactivated);
    expect(closed.activity.isActive).toBe(false);
    expect(closed.activity.currentRound).toBeNull();

    const reactivated = await ctx.app.request(
      `/api/admin/activities/${activity.id}/active`,
      withMethod('PATCH', { isEnabled: true }, superadmin.headers),
    );
    const live = await ctx.json<{ activity: ActivityView }>(reactivated);
    expect(live.activity.isActive).toBe(true);
    expect(live.activity.currentRound).toBeNull();
  });

  it('F36 — an inactive activity cannot open a round', async () => {
    const { activity } = await createActivity(`Kite ${ctx.runId}`);
    await ctx.app.request(
      `/api/admin/activities/${activity.id}/active`,
      withMethod('PATCH', { isEnabled: false }, superadmin.headers),
    );
    const facilitator = await ctx.createFacilitator();
    const blocked = await ctx.app.request(
      `/api/fringe/activities/${activity.id}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    expect(blocked.status).toBe(400);
    expect((await ctx.json<ErrorBody>(blocked)).error.message).toBe(messages.activityInactive);
  });

  it('S39 — the activity list reports the live round for each activity', async () => {
    const { activity } = await createActivity(`Volley ${ctx.runId}`, 6);
    const facilitator = await ctx.createFacilitator();
    const opened = await ctx.app.request(
      `/api/fringe/activities/${activity.id}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    const { round } = await ctx.json<{ round: RoundView }>(opened);

    const listed = await ctx.app.request('/api/admin/activities', asAdmin());
    const { items } = await ctx.json<{ items: ActivityView[] }>(listed);
    const mine = items.find((item) => item.id === activity.id);
    expect(mine?.currentRound?.id).toBe(round.id);
    expect(mine?.currentRound?.status).toBe('open');
  });
});
