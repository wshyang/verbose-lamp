import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@psd/contracts';
import { ApiError, OfflineError, apiGet, apiPost } from './client.js';
import { clearScreenKey, writeScreenKey } from '../session/screenKeyStore.js';
import {
  clearSessionToken,
  readSessionCarrier,
  writeSessionCarrier,
  writeSessionToken,
} from '../session/tokenStore.js';

/**
 * The wire boundary itself: what the rest of the app is allowed to assume about a failed
 * request. A body we cannot read must still produce a message a facilitator can act on.
 */

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
  clearSessionToken();
  clearScreenKey();
  writeSessionCarrier('header');
  window.localStorage.clear();
});

function respondWith(body: string, status: number) {
  globalThis.fetch = vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

interface Attempt {
  url: string;
  headers: Record<string, string>;
}

/** Records what left the page, and answers 401 until the token arrives the accepted way. */
function acceptOnly(carrier: 'header' | 'query') {
  const attempts: Attempt[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    attempts.push({ url, headers });
    const arrived =
      carrier === 'header' ? headers['x-psd-session'] === 'tok-1' : url.includes('session_token=');
    return arrived
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response(JSON.stringify({ error: { message: messages.signInRequired } }), {
          status: 401,
        });
  }) as unknown as typeof fetch;
  return attempts;
}

describe('api client', () => {
  it('turns a wire error into an ApiError carrying the message and field', async () => {
    respondWith(JSON.stringify({ error: { message: messages.pinInvalid, field: 'pin' } }), 400);

    const failure = await apiPost('/api/auth/participants/signin', { pin: '1' }).catch(
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 400, message: messages.pinInvalid, field: 'pin' });
  });

  it('falls back to a usable message when the failure has no readable body', async () => {
    respondWith('<html>502 Bad Gateway</html>', 502);

    const failure = (await apiGet('/api/clusters').catch((caught: unknown) => caught)) as ApiError;

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.message).toBe(messages.notFound);
    expect(failure.field).toBeUndefined();
  });

  it('sends the held token in a header so an embedded page still has a session (ADR-016)', async () => {
    writeSessionToken('tok-1');
    const attempts = acceptOnly('header');

    await expect(apiGet('/api/me')).resolves.toEqual({ ok: true });

    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.url).toBe('/api/me');
    expect(attempts[0]?.headers['x-psd-session']).toBe('tok-1');
    expect(attempts[0]?.headers['authorization']).toBe('Bearer tok-1');
  });

  /*
   * ADR-263 — the sticky-session header rides signed-in and anonymous traffic
   * alike, and stays one value across requests: the balancer hashes it to keep
   * this browser on one instance. It is never the session token itself.
   */
  it('sends one sticky-session id on every request, signed in or not', async () => {
    const attempts: Attempt[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key] = value;
      });
      attempts.push({ url: String(input), headers });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    await apiGet('/api/anything');
    writeSessionToken('tok-1');
    await apiGet('/api/anything');

    const sticky = attempts.map((attempt) => attempt.headers['x-sticky-session']);
    expect(sticky[0]).toBeTruthy();
    expect(sticky[1]).toBe(sticky[0]);
    expect(sticky).not.toContain('tok-1');
  });

  it('sends nothing extra when nobody is signed in', async () => {
    const attempts = acceptOnly('query');

    await apiGet('/api/clusters').catch(() => null);

    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.headers['x-psd-session']).toBeUndefined();
    expect(attempts[0]?.url).toBe('/api/clusters');
  });

  it('learns to use the query string when a proxy eats the header', async () => {
    writeSessionToken('tok-1');
    const attempts = acceptOnly('query');

    await expect(apiGet('/api/me?full=1')).resolves.toEqual({ ok: true });

    expect(attempts.map((attempt) => attempt.url)).toEqual([
      '/api/me?full=1',
      '/api/me?full=1&session_token=tok-1',
    ]);
    expect(readSessionCarrier()).toBe('query');

    // Remembered: the next request goes straight there, no 401 round trip.
    await expect(apiPost('/api/teams', { name: 'Kelongs' })).resolves.toEqual({ ok: true });
    expect(attempts[2]?.url).toBe('/api/teams?session_token=tok-1');
    expect(attempts[2]?.headers['x-psd-session']).toBeUndefined();
  });

  it('keeps a real 401 a 401 instead of blaming the carrier', async () => {
    writeSessionToken('expired');
    const attempts = acceptOnly('header');

    const failure = (await apiGet('/api/me').catch((caught: unknown) => caught)) as ApiError;

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.status).toBe(401);
    expect(attempts).toHaveLength(2);
    expect(readSessionCarrier()).toBe('header');
  });

  it('reports a dead network as an OfflineError, not a server error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const failure = await apiGet('/api/clusters').catch((caught: unknown) => caught);

    expect(failure).toBeInstanceOf(OfflineError);
    expect((failure as OfflineError).message).toBe(messages.connectionError);
  });
});

/**
 * ADR-140 — the hall screen's key is a second credential, not a second session. These assert
 * it reaches the API by both roads, because the projector has no person to retry for it.
 */
describe('the hall screen key on the wire', () => {
  it('rides a header of its own, beside no session at all', async () => {
    const attempts: Attempt[] = [];
    writeScreenKey('scr-1');
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key] = value;
      });
      attempts.push({ url: String(input), headers });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;

    await apiGet('/api/leaderboard');
    expect(attempts.at(-1)?.headers['x-psd-screen']).toBe('scr-1');
    // It is emphatically not a session: nothing here may make the API treat it as one.
    expect(attempts.at(-1)?.headers['authorization']).toBeUndefined();
  });

  it('follows the session token into the query string when this tunnel eats headers', async () => {
    const attempts: Attempt[] = [];
    writeScreenKey('scr-1');
    writeSessionToken('tok-1');
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key] = value;
      });
      attempts.push({ url, headers });
      return url.includes('screen_key=scr-1') && url.includes('session_token=tok-1')
        ? new Response('{"ok":true}', { status: 200 })
        : new Response('{}', { status: 401 });
    }) as unknown as typeof fetch;

    await apiGet('/api/leaderboard');
    expect(attempts).toHaveLength(2);
    expect(readSessionCarrier()).toBe('query');
  });
});
