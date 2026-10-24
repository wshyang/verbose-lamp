import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AVATAR_SPRITE_MAX_LENGTH } from '@psd/contracts';
import { JSON_BODY_MAX_BYTES } from '../lib/bodyLimit.js';
import { createTestContext, jsonRequest, type TestContext } from './harness.js';

/**
 * ADR-324 — nothing is allowed to make the server buffer an arbitrary body.
 *
 * Every JSON route read its body with `c.req.json()`, which buffers all of it and then parses it
 * in one synchronous step; the only `bodyLimit` in the app was on the photo upload. A single
 * oversized POST to the unauthenticated sign-in route was therefore a memory spike and an
 * event-loop freeze for every phone. The ceiling is set from the largest body the contracts
 * allow (an avatar sprite, 50 000 characters), not guessed.
 */
describe('JSON body limit', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('is generous enough for the largest legitimate body', () => {
    expect(JSON_BODY_MAX_BYTES).toBeGreaterThan(AVATAR_SPRITE_MAX_LENGTH + 4_096);
  });

  it('answers 413 to a megabyte posted at the unauthenticated sign-in route', async () => {
    const response = await ctx.app.request(
      '/api/auth/participants/signin',
      jsonRequest({ nickname: 'x', pin: '1234', padding: 'a'.repeat(1_000_000) }),
    );
    expect(response.status).toBe(413);
  });

  it('answers 413 when the declared length is a lie in the other direction (chunked, no length)', async () => {
    const big = 'a'.repeat(JSON_BODY_MAX_BYTES + 1_000);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`{"nickname":"x","pin":"1234","padding":"${big}"}`));
        controller.close();
      },
    });
    const response = await ctx.app.request('/api/auth/participants/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    });
    expect(response.status).toBe(413);
  });

  it('still accepts a normal sign-in body', async () => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/auth/participants/signin',
      jsonRequest({ nickname: participant.nickname, pin: participant.pin }),
    );
    expect(response.status).toBe(200);
  });

  it('answers 413 with the same JSON error envelope the rest of the API uses', async () => {
    const response = await ctx.app.request(
      '/api/auth/participants/signin',
      jsonRequest({ padding: 'a'.repeat(JSON_BODY_MAX_BYTES + 10) }),
    );
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(typeof body.error.message).toBe('string');
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it('leaves the photo upload its own, larger limit', async () => {
    const participant = await ctx.signUpParticipant();
    const form = new FormData();
    form.set('note', 'a'.repeat(JSON_BODY_MAX_BYTES + 10));
    const response = await ctx.app.request('/api/gallery/photos', {
      method: 'POST',
      headers: participant.headers,
      body: form,
    });
    // Refused for being an invalid upload (400-class from the route's own validation), not for
    // exceeding the JSON ceiling that does not apply to it.
    expect(response.status).not.toBe(413);
  });
});
