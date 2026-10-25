import { messages } from '@psd/contracts';
import type { ActivityView, FacilitatorView, SessionView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  jsonRequest,
  withMethod,
  type ActorSession,
  type TestContext,
} from './harness.js';

/**
 * F39–F40 facilitator accounts (S44–S46), F57–F59 superadmin accounts, and F20 — the default
 * station a facilitator lands on. F41 (delete facilitator) is deliberately out of scope.
 */

interface ErrorBody {
  error: { message: string; field?: string };
}

describe('F39–F40, F20 — staff accounts and default stations', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
  });
  afterAll(async () => {
    await ctx.close();
  });

  function username(label: string): string {
    return `${label}${ctx.runId}`.replace(/[^a-z0-9]/gi, '').slice(0, 20);
  }

  async function createFacilitatorAccount(body: Record<string, unknown>) {
    const response = await ctx.app.request(
      '/api/admin/facilitators',
      jsonRequest(body, superadmin.headers),
    );
    return { status: response.status, body: await ctx.json<{ facilitator: FacilitatorView }>(response) };
  }

  async function createActivity(name: string): Promise<ActivityView> {
    const response = await ctx.app.request(
      '/api/admin/activities',
      jsonRequest(
        { activityName: name, awardTiers: [{ label: 'Award', points: 10 }] },
        superadmin.headers,
      ),
    );
    return (await ctx.json<{ activity: ActivityView }>(response)).activity;
  }

  it('F39 — creates a facilitator with a court station type (stale id → null label)', async () => {
    // Courts table removed (ADR-270); any courtId is stale, so label resolves to null.
    const staleCourtId = '01919000-0000-7000-8000-0000000000cc';
    const name = username('courtlead');
    const created = await createFacilitatorAccount({
      username: name,
      passcode: '2468',
      displayLabel: 'Court lead',
      defaultStationType: 'court',
      defaultStationId: staleCourtId,
    });

    expect(created.status).toBe(201);
    expect(created.body.facilitator.defaultStationType).toBe('court');
    expect(created.body.facilitator.defaultStationLabel).toBeNull();
  });

  it('F20 — the session tells the facilitator which station to land on', async () => {
    const activity = await createActivity(`Station ${ctx.runId}`);
    const name = username('fringelead');
    await createFacilitatorAccount({
      username: name,
      passcode: '1357',
      defaultStationType: 'fringe_activity',
      defaultStationId: activity.id,
    });

    const signIn = await ctx.app.request(
      '/api/auth/facilitators/signin',
      jsonRequest({ username: name, passcode: '1357' }),
    );
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get('set-cookie')?.split(';')[0] ?? '';

    const session = await ctx.app.request('/api/auth/session', { headers: { cookie } });
    const view = await ctx.json<SessionView>(session);
    expect(view.actorType).toBe('facilitator');
    expect(view.defaultStation).toEqual({
      type: 'fringe_activity',
      id: activity.id,
      label: activity.activityName,
    });
  });

  it('F20 — a station id that no longer matches anything reports no label, not a crash', async () => {
    const stale = '01919000-0000-7000-8000-0000000000fe';
    for (const [type, label] of [
      ['court', 'stalecourt'],
      ['fringe_activity', 'stalefringe'],
    ] as const) {
      const name = username(label);
      await createFacilitatorAccount({
        username: name,
        passcode: '1212',
        defaultStationType: type,
        defaultStationId: stale,
      });
      const signIn = await ctx.app.request(
        '/api/auth/facilitators/signin',
        jsonRequest({ username: name, passcode: '1212' }),
      );
      const cookie = signIn.headers.get('set-cookie')?.split(';')[0] ?? '';
      const session = await ctx.app.request('/api/auth/session', { headers: { cookie } });
      const view = await ctx.json<SessionView>(session);
      expect(view.defaultStation).toEqual({ type, id: stale, label: null });
    }
  });

  it('F20 — a facilitator with no default station gets none, not a sentinel', async () => {
    const name = username('nostation');
    await createFacilitatorAccount({ username: name, passcode: '1111', defaultStationType: 'none' });
    const signIn = await ctx.app.request(
      '/api/auth/facilitators/signin',
      jsonRequest({ username: name, passcode: '1111' }),
    );
    const cookie = signIn.headers.get('set-cookie')?.split(';')[0] ?? '';
    const session = await ctx.app.request('/api/auth/session', { headers: { cookie } });
    const view = await ctx.json<SessionView>(session);
    expect(view.defaultStation).toEqual({ type: 'none', id: null, label: null });
  });

  it('F39 — refuses a duplicate username case-insensitively', async () => {
    const name = username('twice');
    await createFacilitatorAccount({ username: name, passcode: '1111', defaultStationType: 'none' });
    const again = await ctx.app.request(
      '/api/admin/facilitators',
      jsonRequest(
        { username: name.toUpperCase(), passcode: '2222', defaultStationType: 'none' },
        superadmin.headers,
      ),
    );
    expect(again.status).toBe(409);
    expect((await ctx.json<ErrorBody>(again)).error.message).toBe(messages.usernameTaken);
  });

  it('F39 — refuses a passcode that is not four digits', async () => {
    const rejected = await ctx.app.request(
      '/api/admin/facilitators',
      jsonRequest(
        { username: username('badpass'), passcode: '12', defaultStationType: 'none' },
        superadmin.headers,
      ),
    );
    expect(rejected.status).toBe(400);
    expect((await ctx.json<ErrorBody>(rejected)).error.message).toBe(messages.passcodeInvalid);
  });

  it('F40 — edits the label and station, and rotating the passcode replaces the old one', async () => {
    const name = username('rotate');
    const created = await createFacilitatorAccount({
      username: name,
      passcode: '1111',
      defaultStationType: 'none',
    });
    const activity = await createActivity(`F40 Station ${ctx.runId}`);

    const edited = await ctx.app.request(
      `/api/admin/facilitators/${created.body.facilitator.id}`,
      withMethod(
        'PUT',
        {
          passcode: '9999',
          displayLabel: 'Beach marshal',
          defaultStationType: 'fringe_activity',
          defaultStationId: activity.id,
        },
        superadmin.headers,
      ),
    );
    const { facilitator } = await ctx.json<{ facilitator: FacilitatorView }>(edited);
    expect(facilitator.displayLabel).toBe('Beach marshal');
    expect(facilitator.defaultStationLabel).toBe(activity.activityName);

    const withOldPasscode = await ctx.app.request(
      '/api/auth/facilitators/signin',
      jsonRequest({ username: name, passcode: '1111' }),
    );
    const withNewPasscode = await ctx.app.request(
      '/api/auth/facilitators/signin',
      jsonRequest({ username: name, passcode: '9999' }),
    );
    expect([withOldPasscode.status, withNewPasscode.status]).toEqual([401, 200]);
  });

  it('F40 — an edit that omits the passcode keeps the current one', async () => {
    const name = username('keeppass');
    const created = await createFacilitatorAccount({
      username: name,
      passcode: '4321',
      defaultStationType: 'none',
    });

    await ctx.app.request(
      `/api/admin/facilitators/${created.body.facilitator.id}`,
      withMethod(
        'PUT',
        { displayLabel: null, defaultStationType: 'none', defaultStationId: null },
        superadmin.headers,
      ),
    );

    const stillWorks = await ctx.app.request(
      '/api/auth/facilitators/signin',
      jsonRequest({ username: name, passcode: '4321' }),
    );
    expect(stillWorks.status).toBe(200);
  });

  it('F40 — 404s when editing an account that does not exist', async () => {
    const response = await ctx.app.request(
      '/api/admin/facilitators/00000000-0000-7000-8000-000000000002',
      withMethod('PUT', { defaultStationType: 'none', defaultStationId: null }, superadmin.headers),
    );
    expect(response.status).toBe(404);
  });

  it('S44 — the facilitator list is alphabetical and shows every account', async () => {
    const response = await ctx.app.request('/api/admin/facilitators', {
      headers: superadmin.headers,
    });
    const { items } = await ctx.json<{ items: FacilitatorView[] }>(response);
    const names = items.map((item) => item.username.toLowerCase());
    expect(names).toEqual([...names].sort());
    expect(items.some((item) => item.username === 'system')).toBe(true);
  });
});

describe('F57–F59 — superadmin accounts', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('S57 — lists the bootstrap superadmin without leaking its passcode', async () => {
    const response = await ctx.app.request('/api/admin/superadmins', {
      headers: superadmin.headers,
    });
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('superadmin');
    expect(body).not.toContain('4242');
  });

  it('S58 — creates a second superadmin who can then sign in', async () => {
    const name = `deputy${ctx.runId}`;
    const created = await ctx.app.request(
      '/api/admin/superadmins',
      jsonRequest({ username: name, passcode: '8642' }, superadmin.headers),
    );
    expect(created.status).toBe(201);

    const signIn = await ctx.app.request(
      '/api/auth/superadmins/signin',
      jsonRequest({ username: name, passcode: '8642' }),
    );
    expect(signIn.status).toBe(200);
  });

  it('S58 — refuses a duplicate superadmin username', async () => {
    const response = await ctx.app.request(
      '/api/admin/superadmins',
      jsonRequest({ username: 'superadmin', passcode: '1212' }, superadmin.headers),
    );
    expect(response.status).toBe(409);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.usernameTaken);
  });

  it('S59 — rotates a passcode, and the old one stops working', async () => {
    const name = `rotator${ctx.runId}`;
    const created = await ctx.app.request(
      '/api/admin/superadmins',
      jsonRequest({ username: name, passcode: '1010' }, superadmin.headers),
    );
    const { superadmin: account } = await ctx.json<{ superadmin: { id: string } }>(created);

    const rotated = await ctx.app.request(
      `/api/admin/superadmins/${account.id}/passcode`,
      withMethod('PUT', { passcode: '2020' }, superadmin.headers),
    );
    expect(rotated.status).toBe(200);

    const oldPasscode = await ctx.app.request(
      '/api/auth/superadmins/signin',
      jsonRequest({ username: name, passcode: '1010' }),
    );
    const newPasscode = await ctx.app.request(
      '/api/auth/superadmins/signin',
      jsonRequest({ username: name, passcode: '2020' }),
    );
    expect([oldPasscode.status, newPasscode.status]).toEqual([401, 200]);
  });

  it('S59 — 404s when rotating a passcode for an unknown superadmin', async () => {
    const response = await ctx.app.request(
      '/api/admin/superadmins/00000000-0000-7000-8000-000000000003/passcode',
      withMethod('PUT', { passcode: '3030' }, superadmin.headers),
    );
    expect(response.status).toBe(404);
  });
});
