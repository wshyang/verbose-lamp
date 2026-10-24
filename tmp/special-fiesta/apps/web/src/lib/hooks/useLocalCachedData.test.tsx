import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import type { SessionView } from '@psd/contracts';
import { useLocalCachedData } from './useLocalCachedData.js';
import { writeCached, readCached } from '../storage/cacheStore.js';
import { SessionContext } from '../session/context.js';
import type { SessionState } from '../session/context.js';
import { participantSession } from '../../test-utils/fixtures.js';

/**
 * ADR-112 — the hook contract: a young cached answer costs NO request; a stale one is
 * warm-started then revalidated; reload always bypasses; a non-participant session never
 * touches storage.
 */

const ACTOR = participantSession.participant?.id as string;

function wrapperFor(session: SessionView | null) {
  const state: SessionState = {
    session,
    isLoading: false,
    refresh: () => Promise.resolve(session),
    endSession: () => Promise.resolve(true),
  };
  return ({ children }: { children: ReactNode }) =>
    createElement(SessionContext.Provider, { value: state }, children);
}

beforeEach(() => window.localStorage.clear());

describe('useLocalCachedData (ADR-112)', () => {
  it('serves a young answer with zero requests — the aggressive mode', async () => {
    writeCached('demo', ACTOR, { value: 'from-device' });
    const loader = vi.fn().mockResolvedValue({ value: 'from-network' });

    const { result } = renderHook(
      () => useLocalCachedData({ name: 'demo', loader, ttlMs: 60_000 }),
      { wrapper: wrapperFor(participantSession) },
    );

    expect(result.current.data).toEqual({ value: 'from-device' });
    expect(result.current.isLoading).toBe(false);
    await act(() => Promise.resolve());
    expect(loader).not.toHaveBeenCalled();
  });

  it('warm-starts a cached answer and still revalidates when ttl is zero', async () => {
    writeCached('demo', ACTOR, { value: 'from-device' });
    const loader = vi.fn().mockResolvedValue({ value: 'fresher' });

    const { result } = renderHook(
      () => useLocalCachedData({ name: 'demo', loader, ttlMs: 0 }),
      { wrapper: wrapperFor(participantSession) },
    );

    // The device answer paints first…
    expect(result.current.data).toEqual({ value: 'from-device' });
    // …and the network's replaces it.
    await waitFor(() => expect(result.current.data).toEqual({ value: 'fresher' }));
    expect(readCached('demo', ACTOR, 60_000)?.data).toEqual({ value: 'fresher' });
  });

  it('reload bypasses the ttl — pull-to-refresh keeps its promise', async () => {
    writeCached('demo', ACTOR, { value: 'from-device' });
    const loader = vi.fn().mockResolvedValue({ value: 'pulled' });

    const { result } = renderHook(
      () => useLocalCachedData({ name: 'demo', loader, ttlMs: 60_000 }),
      { wrapper: wrapperFor(participantSession) },
    );
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toEqual({ value: 'pulled' }));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('changes cache identities with the route parameter rather than showing the prior route', async () => {
    writeCached('team.one', ACTOR, { value: 'one' });
    writeCached('team.two', ACTOR, { value: 'two' });
    const loader = vi.fn().mockResolvedValue({ value: 'from-network' });
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useLocalCachedData({ name, loader, ttlMs: 60_000 }),
      { initialProps: { name: 'team.one' }, wrapper: wrapperFor(participantSession) },
    );

    expect(result.current.data).toEqual({ value: 'one' });
    rerender({ name: 'team.two' });
    await waitFor(() => expect(result.current.data).toEqual({ value: 'two' }));
    expect(loader).not.toHaveBeenCalled();
  });

  /**
   * The slow-answer guard, which nothing pinned before: a request that was started for one
   * surface must not land on another.
   *
   * Found by a sabotage sweep — deleting the `activeKey` check broke no test at all. It is
   * worth more than a tidy-up, because the late answer is not merely *displayed* in the wrong
   * place: it is also written to the device cache under whatever name and actor are current
   * when it finally resolves, so the wrong answer outlives the page that asked for it.
   */
  it('throws away an answer that arrives after the surface has moved on', async () => {
    let settleFirst: (value: { value: string }) => void = () => undefined;
    const loader = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<{ value: string }>((resolve) => { settleFirst = resolve; }),
      )
      .mockResolvedValue({ value: 'two' });
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useLocalCachedData({ name, loader, ttlMs: 0 }),
      { initialProps: { name: 'team.one' }, wrapper: wrapperFor(participantSession) },
    );

    // Move to the second team while the first team's read is still in the air, then let it land.
    rerender({ name: 'team.two' });
    await waitFor(() => expect(result.current.data).toEqual({ value: 'two' }));
    await act(async () => {
      settleFirst({ value: 'one' });
      await Promise.resolve();
    });

    // On screen: still the team actually being looked at.
    expect(result.current.data).toEqual({ value: 'two' });
    // And on the device: the stale answer was not filed under the new team's name, which is
    // the half that would survive a reload and be served instantly next time.
    expect(readCached('team.two', ACTOR, 60_000)?.data).toEqual({ value: 'two' });
  });

  /*
   * The same guard, reached by the other door. A component that unmounts while its read is in
   * flight must not write the answer anywhere — React warns about the state update, but the
   * cache write is silent and would persist.
   */
  it('writes nothing to the device when the surface unmounts mid-request', async () => {
    let settle: (value: { value: string }) => void = () => undefined;
    const loader = vi
      .fn()
      .mockImplementation(() => new Promise<{ value: string }>((resolve) => { settle = resolve; }));
    const { unmount } = renderHook(
      () => useLocalCachedData({ name: 'demo', loader, ttlMs: 0 }),
      { wrapper: wrapperFor(participantSession) },
    );
    await waitFor(() => expect(loader).toHaveBeenCalled());

    unmount();
    await act(async () => {
      settle({ value: 'too-late' });
      await Promise.resolve();
    });

    expect(readCached('demo', ACTOR, 60_000)).toBeNull();
  });

  it('reports a failed cache miss as an ordinary async error', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('No signal'));
    const { result } = renderHook(
      () => useLocalCachedData({ name: 'demo', loader, ttlMs: 60_000 }),
      { wrapper: wrapperFor(participantSession) },
    );

    await waitFor(() => expect(result.current.error).toBe('No signal'));
    expect(result.current.isLoading).toBe(false);
  });

  it('a session with no participant bypasses storage entirely', async () => {
    const loader = vi.fn().mockResolvedValue({ value: 'fetched' });
    const { result } = renderHook(
      () => useLocalCachedData({ name: 'demo', loader, ttlMs: 60_000 }),
      { wrapper: wrapperFor(null) },
    );
    await waitFor(() => expect(result.current.data).toEqual({ value: 'fetched' }));
    expect(window.localStorage.getItem('psd.cache.v1')).toBeNull();
  });
});
