import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { overrideEnv } from '../env.js';
import { createTestContext, jsonRequest, SUPERADMIN_PASSCODE, type TestContext } from './harness.js';

/**
 * ADR-015 — the session cookie is the whole of authentication (ADR-004), so its attributes are
 * part of the contract, not an implementation detail.
 *
 * A participant who signs up and is immediately signed out again is almost always a cookie the
 * browser refused to keep: `SameSite=Lax` is dropped when the app runs inside another site's
 * frame, and `SameSite=None` is dropped without `Secure`. These tests pin the attributes the
 * server promises for each configuration.
 */

const DEFAULT_ENV = {
  COOKIE_SAMESITE: 'Lax',
  COOKIE_SECURE: false,
  COOKIE_PARTITIONED: false,
} as const;

describe('session cookie attributes', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterEach(() => {
    overrideEnv(DEFAULT_ENV);
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function signInAndReadCookie(): Promise<string> {
    const response = await ctx.app.request(
      '/api/auth/superadmins/signin',
      jsonRequest({ username: 'superadmin', passcode: SUPERADMIN_PASSCODE }),
    );
    expect(response.status).toBe(200);
    return response.headers.get('set-cookie') ?? '';
  }

  it('defaults to a first-party cookie: HttpOnly, Lax, no Secure', async () => {
    const cookie = await signInAndReadCookie();

    expect(cookie).toContain('psd_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('Partitioned');
  });

  it('serves an embedded deployment with SameSite=None, Secure and Partitioned', async () => {
    overrideEnv({ COOKIE_SAMESITE: 'None', COOKIE_SECURE: true, COOKIE_PARTITIONED: true });

    const cookie = await signInAndReadCookie();

    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Partitioned');
  });

  it('hands back the token so a cookie-less client can authenticate (ADR-016)', async () => {
    const response = await ctx.app.request(
      '/api/auth/superadmins/signin',
      jsonRequest({ username: 'superadmin', passcode: SUPERADMIN_PASSCODE }),
    );
    const body = await ctx.json<{ sessionToken: string }>(response);
    expect(body.sessionToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    // No cookie at all — only the bearer header a browser cannot strip.
    const session = await ctx.app.request('/api/auth/session', {
      headers: { authorization: `Bearer ${body.sessionToken}` },
    });

    expect(session.status).toBe(200);
    expect(await ctx.json<{ actorType: string }>(session)).toMatchObject({
      actorType: 'superadmin',
    });
  });

  it('accepts the token from the private header and from the query string', async () => {
    const response = await ctx.app.request(
      '/api/auth/superadmins/signin',
      jsonRequest({ username: 'superadmin', passcode: SUPERADMIN_PASSCODE }),
    );
    const { sessionToken } = await ctx.json<{ sessionToken: string }>(response);

    const viaHeader = await ctx.app.request('/api/auth/session', {
      headers: { 'x-psd-session': sessionToken },
    });
    expect(viaHeader.status).toBe(200);

    // The last resort, for an intermediary that rewrites request headers entirely.
    const viaQuery = await ctx.app.request(
      `/api/auth/session?session_token=${encodeURIComponent(sessionToken)}`,
    );
    expect(viaQuery.status).toBe(200);

    const viaNothing = await ctx.app.request('/api/auth/session?session_token=');
    expect(viaNothing.status).toBe(401);
  });

  it('ignores a bearer credential that is not a live session', async () => {
    const forged = await ctx.app.request('/api/auth/session', {
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(forged.status).toBe(401);

    const malformed = await ctx.app.request('/api/auth/session', {
      headers: { authorization: 'Basic user:password' },
    });
    expect(malformed.status).toBe(401);

    const empty = await ctx.app.request('/api/auth/session', {
      headers: { authorization: 'Bearer' },
    });
    expect(empty.status).toBe(401);
  });

  it('prefers the cookie when both travel together', async () => {
    const first = await ctx.app.request(
      '/api/auth/superadmins/signin',
      jsonRequest({ username: 'superadmin', passcode: SUPERADMIN_PASSCODE }),
    );
    const cookie = (first.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const response = await ctx.app.request('/api/auth/session', {
      headers: { cookie, authorization: 'Bearer not-a-real-token' },
    });

    expect(response.status).toBe(200);
  });

  it('signing out ends the session for the bearer path too', async () => {
    const signIn = await ctx.app.request(
      '/api/auth/superadmins/signin',
      jsonRequest({ username: 'superadmin', passcode: SUPERADMIN_PASSCODE }),
    );
    const { sessionToken } = await ctx.json<{ sessionToken: string }>(signIn);
    const authorization = `Bearer ${sessionToken}`;

    const out = await ctx.app.request('/api/auth/signout', {
      method: 'POST',
      headers: { authorization },
    });
    expect(out.status).toBe(200);

    const after = await ctx.app.request('/api/auth/session', { headers: { authorization } });
    expect(after.status).toBe(401);
  });

  it('repeats the attributes when signing out so the browser actually drops the cookie', async () => {
    overrideEnv({ COOKIE_SAMESITE: 'None', COOKIE_SECURE: true, COOKIE_PARTITIONED: true });
    const cookie = (await signInAndReadCookie()).split(';')[0] ?? '';

    const response = await ctx.app.request('/api/auth/signout', {
      method: 'POST',
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    const cleared = response.headers.get('set-cookie') ?? '';
    expect(cleared).toContain('psd_session=;');
    expect(cleared).toContain('SameSite=None');
    expect(cleared).toContain('Secure');
    expect(cleared).toContain('Partitioned');
    expect(cleared).toContain('Max-Age=0');
  });

});
