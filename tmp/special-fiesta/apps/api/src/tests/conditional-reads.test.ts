import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, jsonRequest, type TestContext } from './harness.js';
import { teamNameFor } from './fixtures/names.js';

/**
 * ADR-135 (C1) — the polled surfaces, answered conditionally.
 *
 * Amendment D's requirement, and the reason this file exists rather than three assertions
 * scattered through the suites that already cover these routes: **an ETag that changes on every
 * request is indistinguishable from a working one unless somebody asks it twice.** The feature
 * would ship, every response would carry a validator, every poll would still download the whole
 * body, and nothing would ever fail. So the first assertion for every surface is byte stability,
 * and the second is that the validator actually moves when the data does.
 *
 * `/api/leaderboard` is the case that nearly shipped broken: it stamped `new Date()` into the
 * body at serialisation time, so its hash could never match twice (ADR-135 moved the stamp
 * inside the memo).
 */

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

/** The surfaces `respondCached` is applied to, each with the headers of somebody allowed to read it. */
const SURFACES = [
  '/api/leaderboard',
  '/api/me/alerts',
  '/api/gallery/photos',
] as const;

async function etagOf(path: string, headers: Record<string, string>): Promise<string> {
  const response = await ctx.app.request(path, { headers });
  expect(response.status).toBe(200);
  const etag = response.headers.get('etag');
  expect(etag, `${path} sent no etag`).not.toBeNull();
  return etag ?? '';
}

describe('conditional reads', () => {
  it.each(SURFACES)('gives %s the same validator twice for unchanged data', async (path) => {
    const participant = await ctx.signUpParticipant();

    const first = await etagOf(path, participant.headers);
    const second = await etagOf(path, participant.headers);

    expect(second).toBe(first);
  });

  it.each(SURFACES)('answers %s with 304 and no body when the validator matches', async (path) => {
    const participant = await ctx.signUpParticipant();
    const etag = await etagOf(path, participant.headers);

    const conditional = await ctx.app.request(path, {
      headers: { ...participant.headers, 'if-none-match': etag },
    });

    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe('');
    // The validator comes back on the 304 too, or the browser has nothing to revalidate with next.
    expect(conditional.headers.get('etag')).toBe(etag);
  });

  /*
   * Session-scoped answers must never be reused across people or by a shared cache. `private`
   * keeps proxies out; `no-cache` is what makes a borrowed phone safe, because the stored entry
   * can never be served without asking the server first.
   */
  it.each(SURFACES)('marks %s revalidate-before-use and private to one session', async (path) => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(path, { headers: participant.headers });

    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(response.headers.get('vary')).toContain('authorization');
  });

  it('gives two participants different validators for the same alerts URL', async () => {
    const one = await ctx.signUpParticipant();
    const two = await ctx.signUpParticipant();
    // Only one of them is in a team, so only one of them has anything to be alerted about.
    const team = await ctx.app.request(
      '/api/teams',
      jsonRequest({ teamName: teamNameFor(ctx.runId) }, one.headers),
    );
    expect(team.status).toBe(201);

    expect(await etagOf('/api/me/alerts', one.headers)).not.toBe(
      await etagOf('/api/me/alerts', two.headers),
    );
  });

  it('moves the gallery validator when somebody shares a photo', async () => {
    const participant = await ctx.signUpParticipant();
    const before = await etagOf('/api/gallery/photos', participant.headers);

    const form = new FormData();
    form.set('full', new Blob([WEBP], { type: 'image/webp' }), 'full.webp');
    form.set('thumb', new Blob([WEBP], { type: 'image/webp' }), 'thumb.webp');
    form.set('raw', new Blob([WEBP]), 'IMG_0002.HEIC');
    form.set('filename', 'IMG_0002.HEIC');
    form.set('caption', 'a new validator');
    form.set('width', '1280');
    form.set('height', '960');
    const shared = await ctx.app.request('/api/gallery/photos', {
      method: 'POST',
      headers: participant.headers,
      body: form,
    });
    expect(shared.status).toBe(201);

    expect(await etagOf('/api/gallery/photos', participant.headers)).not.toBe(before);
  });

  /*
   * The honest limit, stated as a test so nobody reads a 304 as a saved query (A-6). The body
   * must be built before it can be hashed, so the server does exactly the same work either
   * way — this saves bytes on the wire and nothing else.
   */
  it('still does the work behind a 304, because the body is what gets hashed', async () => {
    const participant = await ctx.signUpParticipant();
    const etag = await etagOf('/api/leaderboard', participant.headers);

    const selects = await countingSelects(async () => {
      const conditional = await ctx.app.request('/api/leaderboard', {
        headers: { ...participant.headers, 'if-none-match': etag },
      });
      expect(conditional.status).toBe(304);
    });

    expect(selects).toBeGreaterThan(0);
  });
});

async function countingSelects(run: () => Promise<void>): Promise<number> {
  const original = ctx.handle.db.select.bind(ctx.handle.db);
  let calls = 0;
  // Counted by wrapping rather than by spying, so the call still reaches the real database.
  ctx.handle.db.select = ((...args: Parameters<typeof original>) => {
    calls += 1;
    return original(...args);
  }) as typeof ctx.handle.db.select;
  try {
    await run();
  } finally {
    ctx.handle.db.select = original;
  }
  return calls;
}

/** The smallest thing the byte sniffer accepts as a WebP (ADR-050). */
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
]);
