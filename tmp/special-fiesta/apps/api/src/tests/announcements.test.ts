import { messages } from '@psd/contracts';
import type { AlertsView, AnnouncementView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, jsonRequest, type TestContext } from './harness.js';

/**
 * Staff announcements (ADR-074).
 *
 * What is worth pinning here is what the server does and does NOT hold. It serves one live list to
 * everybody, oldest first, and it keeps no record of who has dismissed what — that lives in each
 * browser (ADR-074), which is why there is a test asserting the dismissal route does not exist.
 */
describe('ADR-074 — staff announcements', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function announce(body: string): Promise<AnnouncementView> {
    const admin = await ctx.signInSuperadmin();
    const response = await ctx.app.request(
      '/api/admin/announcements',
      jsonRequest({ body }, admin.headers),
    );
    expect(response.status).toBe(201);
    return (await ctx.json<{ announcement: AnnouncementView }>(response)).announcement;
  }

  /** Reads the opening SSE frame and lets go of the socket. */
  async function firstFrame(response: Response): Promise<string> {
    const body = response.body;
    if (!body) throw new Error('The stream had no body');
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    try {
      while (!buffered.includes('\n\n')) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel();
    }
    return buffered;
  }

  async function alertsFor(actor: { headers: Record<string, string> }): Promise<AlertsView> {
    const response = await ctx.app.request('/api/me/alerts', { headers: actor.headers });
    expect(response.status).toBe(200);
    return ctx.json<AlertsView>(response);
  }

  it('reaches every participant, labelled with the author it was written by', async () => {
    const reader = await ctx.signUpParticipant();

    const made = await announce('Finals start at 4pm on court 1');
    const alerts = await alertsFor(reader);

    expect(alerts.announcements.map((a) => a.id)).toContain(made.id);
    const seen = alerts.announcements.find((a) => a.id === made.id);
    expect(seen?.body).toBe('Finals start at 4pm on court 1');
    // Snapshotted, so renaming the account later cannot rewrite what the beach was told.
    expect(seen?.authorLabel).toBe('superadmin');
  });

  it('offers the same live list to every participant', async () => {
    const one = await ctx.signUpParticipant();
    const two = await ctx.signUpParticipant();
    const made = await announce('Kueh at the prize table');

    const first = await alertsFor(one);
    const second = await alertsFor(two);

    /*
     * ADR-074 — identical for everybody, on purpose. Whether a reader has clicked a toast away is kept
     * in their own browser, so the server holds no per-reader state and this read is cacheable once
     * for the whole event rather than once per phone.
     */
    expect(first.announcements.map((a) => a.id)).toContain(made.id);
    expect(second.announcements).toEqual(first.announcements);
  });

  it('has no dismissal endpoint to reach', async () => {
    const reader = await ctx.signUpParticipant();
    const made = await announce('Sunscreen at the marshal tent');

    const response = await ctx.app.request(`/api/me/announcements/${made.id}/dismiss`, {
      method: 'POST',
      headers: reader.headers,
    });

    // Asserted rather than assumed: dismissal moved to the browser, and a route left behind would be
    // a second source of truth for the same fact.
    expect(response.status).toBe(404);
  });

  it('keeps them oldest first, so a reader catches up in order', async () => {
    const reader = await ctx.signUpParticipant();
    const first = await announce('First thing');
    const second = await announce('Second thing');

    const alerts = await alertsFor(reader);
    const ids = alerts.announcements.map((a) => a.id);

    // The toast shows one at a time; dismissing the oldest reveals the next, so order is the feature.
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
  });

  it('retracts softly: gone from every reader, still on the row', async () => {
    const reader = await ctx.signUpParticipant();
    const made = await announce('Ignore the previous message');
    const admin = await ctx.signInSuperadmin();

    const retracted = await ctx.app.request(`/api/admin/announcements/${made.id}/retract`, {
      method: 'POST',
      headers: admin.headers,
    });
    expect(retracted.status).toBe(200);

    const alerts = await alertsFor(reader);
    expect(alerts.announcements.map((a) => a.id)).not.toContain(made.id);
    // Still listed in the console, because a retraction is an audit fact rather than an erasure.
    const listed = await ctx.json<{ announcements: AnnouncementView[] }>(
      await ctx.app.request('/api/admin/announcements', { headers: admin.headers }),
    );
    expect(listed.announcements.map((a) => a.id)).toContain(made.id);
  });

  /**
   * The cache-invalidation audit of 2026-10-05 (`docs/outstanding-tasks.md` §9), finding K7.
   *
   * The retraction test above passes with `invalidateAnnouncement`'s `invalidateTag` deleted,
   * and the reason is worth stating because it generalises: that test never puts the
   * pre-retraction answer INTO the cache. It announces (which voids the tag), retracts, then
   * reads — so the read it asserts on is the first one after the write and is fresh whether
   * the invalidation happened or not. A cache test that never warms the cache is testing
   * nothing.
   *
   * The real victim is the SSE reconnect. `readAlertsFor` backs both the alerts poll and the
   * `status.snapshot` frame every stream opens with, and `announcements.live` is held for five
   * seconds. So: a phone polls (warming the list with the announcement in it), a superadmin
   * retracts, and for the next five seconds every phone that reconnects is handed the
   * retracted announcement in its opening frame — while the phones that stayed connected got
   * the retraction frame and dropped it. The two populations disagree, and the one being told
   * to ignore the previous message is the one that reconnected.
   */
  it('does not serve a retracted announcement to a reader whose list was already warm', async () => {
    const reader = await ctx.signUpParticipant();
    const made = await announce('Scratch that, the final is on court two');
    const admin = await ctx.signInSuperadmin();

    // Warm it. THIS is the step whose absence makes the test above blind.
    const warm = await alertsFor(reader);
    expect(warm.announcements.map((a) => a.id)).toContain(made.id);

    const retracted = await ctx.app.request(`/api/admin/announcements/${made.id}/retract`, {
      method: 'POST',
      headers: admin.headers,
    });
    expect(retracted.status).toBe(200);

    // No sleep: the point is that the retraction VOIDS the entry rather than waiting it out.
    const after = await alertsFor(reader);
    expect(after.announcements.map((a) => a.id)).not.toContain(made.id);

    // And the same for a phone opening a stream fresh, which is the population that suffers.
    const stream = await ctx.app.request('/api/status/stream', { headers: reader.headers });
    expect(stream.status).toBe(200);
    const snapshot = await firstFrame(stream);
    expect(snapshot).toContain('event: status.snapshot');
    expect(snapshot).not.toContain(made.id);
  });

  it('refuses an empty body with the contract message', async () => {
    const admin = await ctx.signInSuperadmin();

    const response = await ctx.app.request(
      '/api/admin/announcements',
      jsonRequest({ body: '   ' }, admin.headers),
    );

    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.chatMessageEmpty);
  });
});
