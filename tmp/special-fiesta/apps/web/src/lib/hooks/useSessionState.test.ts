import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { participantSession } from '../../test-utils/fixtures.js';
import { useSessionState } from './useSessionState.js';
import { clearSessionToken, readSessionToken, writeSessionToken } from '../session/tokenStore.js';
import { readCached, writeCached } from '../storage/cacheStore.js';
import { readRememberedSession, rememberSession } from '../session/sessionCache.js';

let stub: FetchStub;
beforeEach(() => {
  clearSessionToken();
  window.localStorage.clear();
});
afterEach(() => {
  stub?.restore();
  clearSessionToken();
  window.localStorage.clear();
});

describe('useSessionState', () => {
  it('restores a long-lived cookie session on boot (F4)', async () => {
    stub = installFetchStub({ 'GET /api/auth/session': { body: participantSession } });
    const { result } = renderHook(() => useSessionState());

    await waitFor(() => expect(result.current.session?.actorType).toBe('participant'));
    expect(result.current.session?.participant?.nickname).toBe('BeachBoss');
  });

  it('paints an identity tied to the held token, then still revalidates it', async () => {
    writeSessionToken('warm-token');
    rememberSession(participantSession);
    stub = installFetchStub({
      'GET /api/auth/session': { body: participantSession, delayMs: 30 },
    });

    const { result } = renderHook(() => useSessionState());

    // The cached identity is useful immediately; it is not an excuse to skip /session.
    expect(result.current.session?.participant?.nickname).toBe('BeachBoss');
    expect(result.current.isLoading).toBe(false);
    expect(stub.callsTo('GET /api/auth/session')).toHaveLength(1);
    await waitFor(() => expect(stub.callsTo('GET /api/auth/session')).toHaveLength(1));
  });

  it('forgets a warm identity if its mandatory revalidation refuses it', async () => {
    writeSessionToken('warm-token');
    rememberSession(participantSession);
    stub = installFetchStub({
      'GET /api/auth/session': { status: 401, body: { error: { message: 'Please sign in.' } } },
    });

    const { result } = renderHook(() => useSessionState());

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(readRememberedSession()).toBeNull();
  });

  it('ignores a session answer that arrives after the app moved on', async () => {
    const original = globalThis.fetch;
    let fail: (reason: Error) => void = () => undefined;
    globalThis.fetch = (() =>
      new Promise((_resolve, reject) => {
        fail = reject;
      })) as unknown as typeof fetch;

    const { unmount } = renderHook(() => useSessionState());
    unmount();
    await act(async () => {
      fail(new TypeError('Failed to fetch'));
    });

    globalThis.fetch = original;
  });

  it('treats a 401 as signed out rather than an error', async () => {
    stub = installFetchStub({
      'GET /api/auth/session': { status: 401, body: { error: { message: 'Please sign in.' } } },
    });
    const { result } = renderHook(() => useSessionState());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('clears the session when signing out', async () => {
    stub = installFetchStub({
      'GET /api/auth/session': { body: participantSession },
      'POST /api/auth/signout': { body: { ok: true } },
    });
    const { result } = renderHook(() => useSessionState());
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      await result.current.endSession();
    });

    expect(stub.callsTo('POST /api/auth/signout')).toHaveLength(1);
  });

  it('purges a local session even when the sign-out request is offline', async () => {
    writeSessionToken('still-local');
    writeCached('me', participantSession.participant?.id as string, { nickname: 'BeachBoss' });
    stub = installFetchStub({
      'GET /api/auth/session': { body: participantSession },
      'POST /api/auth/signout': { offline: true },
    });
    const { result } = renderHook(() => useSessionState());
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      await result.current.endSession();
    });

    expect(readSessionToken()).toBeNull();
    expect(readCached('me', participantSession.participant?.id as string, 60_000)).toBeNull();
  });
});
