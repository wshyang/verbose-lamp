import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { VenueView } from '@psd/contracts';
import { getEnv, overrideEnv, parseEnv } from '../env.js';
import { createTestContext, type TestContext } from './harness.js';

/**
 * ADR-295 — the venue is a fact about the deployment, read before anyone has a session.
 *
 * The scene and the palette are drawn on Landing and Sign-in, so the route is public. It is also
 * the only thing the web asks for to decide what the app looks like, so what it returns must
 * come from the environment and nowhere else.
 */

let ctx: TestContext;
let originalVenue: ReturnType<typeof getEnv>['PSD_VENUE'];

beforeAll(async () => {
  ctx = await createTestContext();
  originalVenue = getEnv().PSD_VENUE;
});

afterAll(async () => {
  overrideEnv({ PSD_VENUE: originalVenue });
  await ctx.close();
});

describe('GET /api/venue (ADR-295)', () => {
  it('answers a phone with no session, with the configured venue', async () => {
    const response = await ctx.app.request('/api/venue');

    expect(response.status).toBe(200);
    expect(await ctx.json<VenueView>(response)).toEqual({ venue: 'sentosa' });
  });

  it('is never held by a cache, because the next page load must see a change', async () => {
    const response = await ctx.app.request('/api/venue');

    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('reads the environment at request time, not a constant', async () => {
    // One venue exists today, so a literal "sentosa" would pass any honest value. The override
    // is cast to a value the contracts do not list: the route must echo what the environment
    // holds, not what it expects, which is what a second venue will rely on.
    overrideEnv({ PSD_VENUE: 'test-venue' as typeof originalVenue });

    expect(await ctx.json<VenueView>(await ctx.app.request('/api/venue'))).toEqual({
      venue: 'test-venue',
    });
  });

  it('answers the same to every kind of caller', async () => {
    overrideEnv({ PSD_VENUE: originalVenue });
    const participant = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();

    for (const headers of [participant.headers, superadmin.headers]) {
      const response = await ctx.app.request('/api/venue', { headers });
      expect(await ctx.json<VenueView>(response)).toEqual({ venue: 'sentosa' });
    }
  });
});

describe('PSD_VENUE validation (ADR-295)', () => {
  it('refuses an unknown venue at boot rather than serving a blank page', () => {
    expect(() => parseEnv({ ...process.env, PSD_VENUE: 'nowhere' })).toThrow(/PSD_VENUE/);
  });

  it('refuses a venue spelled differently from its id', () => {
    expect(() => parseEnv({ ...process.env, PSD_VENUE: 'Sentosa' })).toThrow(/PSD_VENUE/);
  });

  it('defaults to Sentosa when unset', () => {
    const { PSD_VENUE: _unset, ...rest } = process.env;

    expect(parseEnv(rest).PSD_VENUE).toBe('sentosa');
  });
});
