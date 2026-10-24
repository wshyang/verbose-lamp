import { messages } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './harness.js';

/**
 * ADR-164 — the forgotten-nickname lookup, which exists to stop a second sign-up.
 *
 * The route is a single `SELECT`, so what is worth pinning is not that it returns rows but the
 * four decisions around it: that it answers an anonymous caller (anything else makes it
 * useless to the only person who needs it), that it answers with nicknames and NOTHING else,
 * that the cluster actually narrows the answer, and that an absent or invented cluster is
 * refused rather than silently answered with the whole event.
 */

describe('ADR-164 — finding a forgotten nickname', () => {
  let ctx: TestContext;
  let inBp: string;
  let inCs: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    inBp = (await ctx.signUpParticipant({ clusterCode: 'BP' })).nickname;
    inCs = (await ctx.signUpParticipant({ clusterCode: 'CS' })).nickname;
  });
  afterAll(async () => {
    await ctx.close();
  });

  /*
   * The load-bearing one. A participant who cannot remember their nickname cannot sign in, and
   * a lookup behind a session would therefore be available only to people who do not need it.
   * No header is sent here on purpose.
   */
  it('answers a caller with no session at all', async () => {
    const response = await ctx.app.request('/api/participants/nicknames?clusterCode=BP');

    expect(response.status).toBe(200);
    const body = await ctx.json<{ nicknames: string[] }>(response);
    expect(body.nicknames).toContain(inBp);
  });

  it('narrows to the cluster asked for', async () => {
    const response = await ctx.app.request('/api/participants/nicknames?clusterCode=BP');

    const body = await ctx.json<{ nicknames: string[] }>(response);
    // Both halves matter: without the first, a route that ignored the filter would pass.
    expect(body.nicknames).toContain(inBp);
    expect(body.nicknames).not.toContain(inCs);
  });

  /*
   * The whole privacy surface of this feature, as a test. A nickname is already on the
   * leaderboard; a PIN, a scan number or an id is not, and an anonymous reader must not be
   * able to collect one. Asserting the SHAPE rather than the absence of named fields, so a
   * field added to the row later cannot leak through this route unnoticed.
   */
  it('answers with bare nicknames and nothing else about anybody', async () => {
    const response = await ctx.app.request('/api/participants/nicknames?clusterCode=BP');

    const body = await ctx.json<Record<string, unknown>>(response);
    expect(Object.keys(body)).toEqual(['nicknames']);
    for (const entry of body['nicknames'] as unknown[]) expect(typeof entry).toBe('string');
  });

  it('reads in case-insensitive nickname order, so the eye can run down it', async () => {
    const ordered = await ctx.signUpParticipant({ clusterCode: 'HRP', nickname: 'aaa_Early' });
    await ctx.signUpParticipant({ clusterCode: 'HRP', nickname: 'ZZZ_Late' });
    await ctx.signUpParticipant({ clusterCode: 'HRP', nickname: 'mmm_Middle' });

    const response = await ctx.app.request('/api/participants/nicknames?clusterCode=HRP');

    const body = await ctx.json<{ nicknames: string[] }>(response);
    expect(body.nicknames[0]).toBe(ordered.nickname);
    expect(body.nicknames.at(-1)).toBe('ZZZ_Late');
  });

  /*
   * Refused, not defaulted. Answering a missing cluster with every nickname at the event would
   * be a list nobody can read down — and it would turn a typo in the client into a scrape.
   */
  it('refuses a request that names no cluster', async () => {
    const response = await ctx.app.request('/api/participants/nicknames');

    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.clusterRequired);
  });

  it('refuses a cluster that is not one of the sixteen', async () => {
    const response = await ctx.app.request('/api/participants/nicknames?clusterCode=NOPE');

    expect(response.status).toBe(400);
  });

  it('answers an empty cluster with an empty list rather than an error', async () => {
    // A cluster nobody has signed up from yet is an ordinary morning, not a fault.
    const response = await ctx.app.request('/api/participants/nicknames?clusterCode=Cumulus');

    expect(response.status).toBe(200);
    const body = await ctx.json<{ nicknames: string[] }>(response);
    expect(body.nicknames).toEqual([]);
  });
});
