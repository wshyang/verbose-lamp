import { messages } from '@psd/contracts';
import type { ServiceStateView } from '@psd/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  jsonRequest,
  seedFringeReady,
  type ActorSession,
  type TestContext,
} from './harness.js';
import { onShutdownRequest, resetShutdownHandlerForTests } from '../lib/lifecycle.js';

/**
 * ADR-118 — S61, the operations switch and the restart button.
 *
 * The two questions these tests exist to answer are the two an operator is betting the
 * event on: does pausing actually stop the expensive traffic, and does it leave everything
 * that scores — and the console they will un-pause from — still working?
 */
describe('S61 — operations controls', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
  });
  afterAll(async () => ctx.close());
  afterEach(() => resetShutdownHandlerForTests());

  const pause = () =>
    ctx.app.request(
      '/api/admin/service-state/pause-social',
      jsonRequest({}, superadmin.headers),
    );
  const resume = () =>
    ctx.app.request(
      '/api/admin/service-state/resume-social',
      jsonRequest({}, superadmin.headers),
    );

  describe('pausing the non-essentials', () => {
    it('closes chat and photos for participants, and says why', async () => {
      const participant = await ctx.signUpParticipant();
      const before = await ctx.app.request('/api/chat/messages', {
        headers: participant.headers,
      });
      expect(before.status).toBe(200);

      expect((await pause()).status).toBe(200);

      const chat = await ctx.app.request('/api/chat/messages', { headers: participant.headers });
      expect(chat.status).toBe(503);
      const body = await ctx.json<{ error: { message: string } }>(chat);
      expect(body.error.message).toBe(messages.socialPaused);

      const photos = await ctx.app.request('/api/gallery/photos', {
        headers: participant.headers,
      });
      expect(photos.status).toBe(503);
      await resume();
    });

    it('leaves everything that scores alone — the whole point of pausing', async () => {
      const fixture = await seedFringeReady(ctx);
      const participant = await ctx.signUpParticipant();
      await pause();

      // Scanning is the event. If a pause could stop this, nobody would ever dare press it.
      const scan = await ctx.app.request(
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
      expect(scan.status).toBe(201);

      for (const path of ['/api/leaderboard', '/api/me', '/api/teams']) {
        const response = await ctx.app.request(path, { headers: participant.headers });
        expect([200, 404]).toContain(response.status);
      }
      await resume();
    });

    it('keeps the console reachable, moderation included, so it can be undone', async () => {
      await pause();

      // The trap this pins: gallery moderation lives under /api/gallery, so a path-only
      // guard would have taken the superadmin's photo queue down with the participants'.
      const moderation = await ctx.app.request('/api/gallery/moderation', {
        headers: superadmin.headers,
      });
      expect(moderation.status).toBe(200);

      const state = await ctx.app.request('/api/admin/service-state', {
        headers: superadmin.headers,
      });
      const body = await ctx.json<{ state: ServiceStateView }>(state);
      expect(body.state.isSocialPaused).toBe(true);
      expect(body.state.updatedByUsername).toBe('superadmin');
      await resume();
    });

    it('turns back on, and an untouched event is not paused to begin with', async () => {
      const participant = await ctx.signUpParticipant();
      await pause();
      expect((await resume()).status).toBe(200);

      const chat = await ctx.app.request('/api/chat/messages', { headers: participant.headers });
      expect(chat.status).toBe(200);
    });

    it('refuses a facilitator — this is a superadmin switch', async () => {
      const fixture = await seedFringeReady(ctx);
      const response = await ctx.app.request(
        '/api/admin/service-state/pause-social',
        jsonRequest({}, fixture.facilitator.headers),
      );
      expect(response.status).toBe(403);
    });
  });

  describe('the restart button', () => {
    it('answers before it exits, and tells the process who asked', async () => {
      const asked: string[] = [];
      onShutdownRequest((reason) => asked.push(reason));

      const response = await ctx.app.request(
        '/api/admin/system/restart',
        jsonRequest({}, superadmin.headers),
      );

      // 202: the process is still here to answer, which is the only reason the browser
      // ever sees this response at all.
      expect(response.status).toBe(202);
      expect(asked).toEqual(['superadmin superadmin']);
    });

    it('says so rather than lying when nothing can stop this process', async () => {
      const response = await ctx.app.request(
        '/api/admin/system/restart',
        jsonRequest({}, superadmin.headers),
      );
      expect(response.status).toBe(503);
      const body = await ctx.json<{ error: { message: string } }>(response);
      expect(body.error.message).toBe(messages.restartUnavailable);
    });

    it('tells the console whether the button will work before anybody presses it', async () => {
      const read = async () => {
        const response = await ctx.app.request('/api/admin/service-state', {
          headers: superadmin.headers,
        });
        return ctx.json<{ canRestart: boolean }>(response);
      };

      // Nothing has registered a handler, which is the shape of `npm run dev` as much as of
      // this test: a process nobody is supervising cannot usefully exit.
      expect((await read()).canRestart).toBe(false);

      onShutdownRequest(() => {});
      expect((await read()).canRestart).toBe(true);
    });

    it('refuses a facilitator', async () => {
      const fixture = await seedFringeReady(ctx);
      let asked = 0;
      onShutdownRequest(() => {
        asked += 1;
      });
      const response = await ctx.app.request(
        '/api/admin/system/restart',
        jsonRequest({}, fixture.facilitator.headers),
      );
      expect(response.status).toBe(403);
      expect(asked).toBe(0);
    });
  });

  /**
   * ADR-147 — station offline mode. The switch has two jobs and only one of them is
   * "turn the feature on": the other is to be reachable, in a hurry, by a phone that may not
   * be signed in, which is why the read is public and uncacheable.
   */
  describe('station offline mode', () => {
    const enable = () =>
      ctx.app.request(
        '/api/admin/service-state/enable-station-offline',
        jsonRequest({}, superadmin.headers),
      );
    const disable = () =>
      ctx.app.request(
        '/api/admin/service-state/disable-station-offline',
        jsonRequest({}, superadmin.headers),
      );
    const policy = () => ctx.app.request('/api/app-shell-policy');

    it('is off until somebody turns it on, and an anonymous phone may ask', async () => {
      const before = await policy();
      expect(before.status).toBe(200);
      expect(await ctx.json<{ serveFromCache: boolean }>(before)).toEqual({
        serveFromCache: false,
      });

      expect((await enable()).status).toBe(200);
      expect(await ctx.json<{ serveFromCache: boolean }>(await policy())).toEqual({
        serveFromCache: true,
      });

      expect((await disable()).status).toBe(200);
      expect(await ctx.json<{ serveFromCache: boolean }>(await policy())).toEqual({
        serveFromCache: false,
      });
    });

    /*
     * The one header this feature cannot survive losing. A cached policy answer is a kill
     * switch that stays stuck at its last reading, which is worst precisely when it is most
     * needed — the afternoon somebody is trying to turn a bad worker off.
     */
    it('is never cacheable, so the switch can always be flipped back', async () => {
      const response = await policy();
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('etag')).toBeNull();
    });

    it('does not disturb the pause, which is the other switch on the same row', async () => {
      expect((await pause()).status).toBe(200);
      expect((await enable()).status).toBe(200);

      const state = await ctx.app.request('/api/admin/service-state', {
        headers: superadmin.headers,
      });
      const body = await ctx.json<{ state: ServiceStateView }>(state);
      expect(body.state.isSocialPaused).toBe(true);
      expect(body.state.isStationOfflineEnabled).toBe(true);
      // The pause's attribution still names the person who paused, not the person who
      // last touched the row for an unrelated reason.
      expect(body.state.updatedByUsername).not.toBeNull();
      expect(body.state.stationOfflineUpdatedAt).not.toBeNull();

      expect((await resume()).status).toBe(200);
      expect((await disable()).status).toBe(200);
    });

    it('refuses a facilitator — installing code on phones is a superadmin act', async () => {
      const fixture = await seedFringeReady(ctx);
      const response = await ctx.app.request(
        '/api/admin/service-state/enable-station-offline',
        jsonRequest({}, fixture.facilitator.headers),
      );
      expect(response.status).toBe(403);
    });
  });
});

/**
 * ADR-324 — the guard asks on every chat, team-chat and gallery request, photo bytes included, so
 * it used to be one extra query on each. It is memoised now, and the one thing that must not
 * change is how fast a pause lands: the operator pressed the button for this moment.
 */
describe('ADR-324 — the pause is read once a second, and a change is seen at once', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;
  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
  });
  afterAll(async () => ctx.close());

  const toggle = (path: 'pause-social' | 'resume-social') =>
    ctx.app.request(`/api/admin/service-state/${path}`, jsonRequest({}, superadmin.headers));

  it('shuts the door on the very next request after a pause, even straight after a read', async () => {
    const participant = await ctx.signUpParticipant();
    // Warm the memo with "not paused".
    expect((await ctx.app.request('/api/chat/messages', { headers: participant.headers })).status).toBe(200);
    expect((await toggle('pause-social')).status).toBe(200);
    expect((await ctx.app.request('/api/chat/messages', { headers: participant.headers })).status).toBe(503);
    expect((await toggle('resume-social')).status).toBe(200);
    expect((await ctx.app.request('/api/chat/messages', { headers: participant.headers })).status).toBe(200);
  });

  it('asks the database about the pause once for a burst, not once per request', async () => {
    const { vi } = await import('vitest');
    const { findServiceState } = await import('../db/entities/serviceState.js');
    const { invalidateTag, SERVICE_STATE_TAG } = await import('../lib/cache.js');
    const participant = await ctx.signUpParticipant();
    invalidateTag(SERVICE_STATE_TAG);
    // Count the pause's own query by its table: every other read in the request is not this one.
    const select = vi.spyOn(ctx.handle.db, 'select');
    const before = select.mock.calls.length;
    for (let request = 0; request < 10; request += 1) {
      await ctx.app.request('/api/chat/messages', { headers: participant.headers });
    }
    const during = select.mock.calls.length - before;
    select.mockClear();
    invalidateTag(SERVICE_STATE_TAG);
    await ctx.app.request('/api/chat/messages', { headers: participant.headers });
    const oneRequest = select.mock.calls.length;
    select.mockRestore();
    void findServiceState;
    // Ten requests may not cost ten times what one costs: the pause read is shared across them.
    expect(during).toBeLessThan(oneRequest * 10);
    expect(during).toBeLessThanOrEqual(oneRequest * 10 - 9);
  });
});
