import { ALL_SCREEN_SCENE_IDS, SCREEN_KEY_LABEL_MAX, messages } from '@psd/contracts';
import type { ScreenKeyView, ScreenProfileView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { flushPresence } from '../lib/presence.js';
import { createTestContext, jsonRequest, type TestContext } from './harness.js';

/**
 * ADR-140 — the hall screen's key.
 *
 * The feature is a projector that shows the day. The guarantee is that the credential which
 * makes that possible reaches six reads and nothing else — so most of this file is the
 * allowlist, asserted from the outside, because "we only used it on the right routes" is a
 * claim about today's code and a test is a claim about tomorrow's.
 */

let ctx: TestContext;
let screenHeaders: Record<string, string>;
let screenKeyId: string;

interface CreateBody {
  screenKey: ScreenKeyView;
  token: string;
}

async function mintKey(label = 'Main hall'): Promise<CreateBody> {
  const superadmin = await ctx.signInSuperadmin();
  const response = await ctx.app.request(
    '/api/admin/screen-keys',
    jsonRequest({ label }, superadmin.headers),
  );
  expect(response.status).toBe(201);
  return ctx.json<CreateBody>(response);
}

beforeAll(async () => {
  ctx = await createTestContext();
  const created = await mintKey();
  screenKeyId = created.screenKey.id;
  screenHeaders = { 'x-psd-screen': created.token };
});

afterAll(async () => {
  await ctx.close();
});

describe('ADR-140 — what a screen key may read', () => {
  /*
   * The routes a screen key may read. Each is a route that was `requireAnyActor` before and is
   * `requireViewer` now, so each one is a deliberate widening and gets an assertion.
   * ADR-270 — tournament routes removed; the screen now reads the leaderboard and gallery only.
   */
  it.each([
    ['/api/leaderboard'],
    ['/api/gallery/photos'],
  ])('allows %s', async (path) => {
    const response = await ctx.app.request(path, { headers: screenHeaders });
    expect(response.status).toBe(200);
  });

  it('allows the status stream, and hands it the global topic', async () => {
    // The stream never ends, so this asserts the handshake rather than reading to completion.
    const response = await ctx.app.request('/api/status/stream', { headers: screenHeaders });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    await response.body?.cancel();
  });

  it('carries the key in the query string too, because EventSource cannot set a header', async () => {
    const created = await mintKey('Foyer');
    const response = await ctx.app.request(
      `/api/leaderboard?screen_key=${encodeURIComponent(created.token)}`,
    );
    expect(response.status).toBe(200);
  });

  /*
   * The allowlist's other half, and the reason this is a separate guard rather than a fourth
   * actor type: everything below answers `requireAnyActor`, so a screen that WAS an actor
   * would be reading the chat room off a laptop in a public hall.
   */
  it.each([
    ['/api/chat/messages'],
    ['/api/teams'],
    ['/api/me'],
    ['/api/me/scans'],
    ['/api/auth/session'],
    ['/api/admin/screen-keys'],
  ])('refuses %s', async (path) => {
    const response = await ctx.app.request(path, { headers: screenHeaders });
    expect(response.status).toBe(401);
  });

  it('refuses to write anything, even on a surface it can read', async () => {
    const response = await ctx.app.request(
      '/api/gallery/photos/00000000-0000-7000-8000-000000000000/vote',
      jsonRequest({}, screenHeaders),
    );
    expect(response.status).toBe(401);
  });
});

describe('ADR-145 — last seen', () => {
  it('records when a projector last used its key, so a revoke is not a guess', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const created = await mintKey('Foyer');
    const mintedAt = created.screenKey.lastSeenAt;

    await ctx.app.request('/api/leaderboard', { headers: { 'x-psd-screen': created.token } });
    await flushPresence(ctx.handle.db);

    const listed = await ctx.app.request('/api/admin/screen-keys', {
      headers: superadmin.headers,
    });
    const body = await ctx.json<{ items: ScreenKeyView[] }>(listed);
    const mine = body.items.find((item) => item.id === created.screenKey.id);

    /*
     * Before this the column was stamped at creation and never again, so the console would
     * have reported every key — including one nobody ever plugged in — as last seen the
     * moment it was minted. An operator reads this line immediately before revoking, where a
     * wrong answer is the difference between retiring a spare and blanking the hall.
     */
    expect(mine).toBeDefined();
    expect(new Date(mine?.lastSeenAt ?? 0).getTime()).toBeGreaterThan(new Date(mintedAt).getTime());
  });

  it('does not stamp a key that was never used', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const created = await mintKey('Never plugged in');

    await flushPresence(ctx.handle.db);

    const listed = await ctx.app.request('/api/admin/screen-keys', {
      headers: superadmin.headers,
    });
    const body = await ctx.json<{ items: ScreenKeyView[] }>(listed);
    const mine = body.items.find((item) => item.id === created.screenKey.id);
    expect(mine?.lastSeenAt).toBe(created.screenKey.lastSeenAt);
  });
});

describe('ADR-140 — issuing and revoking', () => {
  it('returns the token exactly once, and never again in the list', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const created = await mintKey('Stage left');
    expect(created.token).toMatch(/^[\w-]{20,}$/);

    const listed = await ctx.app.request('/api/admin/screen-keys', {
      headers: superadmin.headers,
    });
    const body = await ctx.json<{ items: ScreenKeyView[] }>(listed);
    const mine = body.items.find((item) => item.id === created.screenKey.id);
    expect(mine?.label).toBe('Stage left');
    // The whole point: no field on this view can carry the credential.
    expect(JSON.stringify(body)).not.toContain(created.token);
  });

  it('stops working the moment it is revoked, with no restart in between', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const created = await mintKey('Doomed');
    const headers = { 'x-psd-screen': created.token };
    expect((await ctx.app.request('/api/leaderboard', { headers })).status).toBe(200);

    const revoked = await ctx.app.request(
      `/api/admin/screen-keys/${created.screenKey.id}/revoke`,
      jsonRequest({}, superadmin.headers),
    );
    expect(revoked.status).toBe(200);
    expect((await ctx.json<{ screenKey: ScreenKeyView }>(revoked)).screenKey.revokedAt).not.toBeNull();

    expect((await ctx.app.request('/api/leaderboard', { headers })).status).toBe(401);
  });

  it('answers a second revoke with 404 rather than pretending it did something', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const created = await mintKey('Twice');
    const path = `/api/admin/screen-keys/${created.screenKey.id}/revoke`;
    expect((await ctx.app.request(path, jsonRequest({}, superadmin.headers))).status).toBe(200);
    expect((await ctx.app.request(path, jsonRequest({}, superadmin.headers))).status).toBe(404);
  });

  it('refuses a key with no name, because a list of unnamed keys cannot be revoked safely', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const blank = await ctx.app.request(
      '/api/admin/screen-keys',
      jsonRequest({ label: '   ' }, superadmin.headers),
    );
    expect(blank.status).toBe(400);
    expect((await ctx.json<{ error: { message: string } }>(blank)).error.message).toBe(
      messages.screenKeyLabelRequired,
    );

    const long = await ctx.app.request(
      '/api/admin/screen-keys',
      jsonRequest({ label: 'x'.repeat(SCREEN_KEY_LABEL_MAX + 1) }, superadmin.headers),
    );
    expect(long.status).toBe(400);
  });

  it('is a superadmin control — the wrong party cannot mint or revoke one', async () => {
    const facilitator = await ctx.createFacilitator('screenguard');
    const participant = await ctx.signUpParticipant();

    for (const headers of [facilitator.headers, participant.headers, {}]) {
      const minted = await ctx.app.request('/api/admin/screen-keys', jsonRequest({ label: 'No' }, headers));
      expect([401, 403]).toContain(minted.status);
      const revoked = await ctx.app.request(
        `/api/admin/screen-keys/${screenKeyId}/revoke`,
        jsonRequest({}, headers),
      );
      expect([401, 403]).toContain(revoked.status);
    }
  });

  it('a screen key cannot mint another screen key', async () => {
    const response = await ctx.app.request(
      '/api/admin/screen-keys',
      jsonRequest({ label: 'Bootstrapping' }, screenHeaders),
    );
    expect(response.status).toBe(401);
  });
});

/**
 * ADR-160 — a key carries the scenes its screen may show.
 *
 * The feature reads as a checklist, so the tests worth having are the ones about the edges
 * a checklist hides: that leaving it out still means "everything" (every key before this
 * existed), that an empty set is refused rather than producing a dark projector nobody can
 * distinguish from a dead one, and that the screen is told through a read it repeats —
 * not once, at pairing time, when nobody will be there to reload it.
 */
describe('ADR-160 — which scenes a screen key may show', () => {
  async function profileFor(headers: Record<string, string>): Promise<Response> {
    return ctx.app.request('/api/status/screen', { headers });
  }

  async function patchScenes(id: string, body: unknown): Promise<Response> {
    const superadmin = await ctx.signInSuperadmin();
    return ctx.app.request(`/api/admin/screen-keys/${id}/scenes`, {
      ...jsonRequest(body, superadmin.headers),
      method: 'PATCH',
    });
  }

  it('shows everything when the minter had no opinion, as every key did before', async () => {
    const created = await mintKey('Silent minter');
    expect(created.screenKey.enabledScenes).toEqual([...ALL_SCREEN_SCENE_IDS]);

    const profile = await profileFor({ 'x-psd-screen': created.token });
    expect(profile.status).toBe(200);
    const body = await ctx.json<ScreenProfileView>(profile);
    expect(body.label).toBe('Silent minter');
    expect(body.enabledScenes).toEqual([...ALL_SCREEN_SCENE_IDS]);
  });

  it('mints a key that shows only what was asked for', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const response = await ctx.app.request(
      '/api/admin/screen-keys',
      jsonRequest({ label: 'Foyer', enabledScenes: ['photosTop', 'photosLatest'] }, superadmin.headers),
    );
    expect(response.status).toBe(201);
    const { screenKey, token } = await ctx.json<CreateBody>(response);
    /*
     * Stored in the canonical running order, not the order they were ticked. Two consoles
     * that chose the same scenes must produce the same row, or a diff of the day's config
     * is full of changes nobody made.
     */
    expect(screenKey.enabledScenes).toEqual(['photosLatest', 'photosTop']);
    expect((await ctx.json<ScreenProfileView>(await profileFor({ 'x-psd-screen': token }))).enabledScenes).toEqual([
      'photosLatest',
      'photosTop',
    ]);
  });

  it('changes what a live screen shows, without touching the projector', async () => {
    const created = await mintKey('Court side');
    const headers = { 'x-psd-screen': created.token };
    expect((await ctx.json<ScreenProfileView>(await profileFor(headers))).enabledScenes).toHaveLength(9);

    const patched = await patchScenes(created.screenKey.id, {
      enabledScenes: ['onCourt', 'upNext'],
    });
    expect(patched.status).toBe(200);
    expect((await ctx.json<{ screenKey: ScreenKeyView }>(patched)).screenKey.enabledScenes).toEqual([
      'onCourt',
      'upNext',
    ]);

    // The screen's own read reflects it immediately — this is the whole point of the route.
    expect((await ctx.json<ScreenProfileView>(await profileFor(headers))).enabledScenes).toEqual([
      'onCourt',
      'upNext',
    ]);
  });

  /*
   * A screen with nothing to show looks exactly like a projector that has died, and the room
   * cannot tell the difference. Turning a screen off is what revoke is for.
   */
  it('refuses an empty scene set, at both doors', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const minted = await ctx.app.request(
      '/api/admin/screen-keys',
      jsonRequest({ label: 'Dark', enabledScenes: [] }, superadmin.headers),
    );
    expect(minted.status).toBe(400);
    expect((await ctx.json<{ error: { message: string } }>(minted)).error.message).toBe(
      messages.screenKeyNeedsAScene,
    );

    const emptied = await patchScenes(screenKeyId, { enabledScenes: [] });
    expect(emptied.status).toBe(400);
  });

  /*
   * Rejected, not filtered. Dropping it silently would save a key with fewer scenes than the
   * superadmin ticked, and they would find that out from a wall in front of an audience.
   */
  it('refuses an unknown scene rather than quietly dropping it', async () => {
    const refused = await patchScenes(screenKeyId, {
      enabledScenes: ['board', 'theWeatherForecast'],
    });
    expect(refused.status).toBe(400);
    expect((await ctx.json<{ error: { message: string } }>(refused)).error.message).toBe(
      messages.screenKeySceneUnknown,
    );
  });

  /*
   * An absent body means "everything" at creation and is an error on the edit: a PATCH that
   * silently reset a carefully-chosen screen to all nine would be the worst possible reading.
   */
  it('refuses an edit that names no scenes at all', async () => {
    expect((await patchScenes(screenKeyId, {})).status).toBe(400);
  });

  it('refuses to edit a revoked key, which is a record of what was projecting', async () => {
    const created = await mintKey('Retired');
    const superadmin = await ctx.signInSuperadmin();
    const revoked = await ctx.app.request(
      `/api/admin/screen-keys/${created.screenKey.id}/revoke`,
      jsonRequest({}, superadmin.headers),
    );
    expect(revoked.status).toBe(200);

    expect((await patchScenes(created.screenKey.id, { enabledScenes: ['board'] })).status).toBe(404);
  });

  it('tells nobody but a screen what a screen shows', async () => {
    const superadmin = await ctx.signInSuperadmin();
    // A signed-in actor is refused (403); an anonymous caller never gets as far (401).
    expect((await profileFor(superadmin.headers)).status).toBe(403);
    expect((await profileFor({})).status).toBe(401);
  });
});
