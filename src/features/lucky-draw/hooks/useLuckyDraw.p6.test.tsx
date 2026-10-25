// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { type LuckyDrawEntry } from '../model/entries';

import { useLuckyDraw } from './useLuckyDraw';

import { setupDomTests } from '@/test/dom';

setupDomTests();
/**
 * `useLuckyDraw` is the phase machine over the pool and the spin. Both halves are
 * doubled so a test can decide exactly when a spin starts and lands; the pool
 * bookkeeping itself is covered by `useDrawPool.test.ts`.
 */
const parts = vi.hoisted(() => ({
  pool: [] as Array<{ id: string; name: string }>,
  guestCount: 300,
  drawnCount: 0,
  exclude: vi.fn(),
  clearExclusions: vi.fn(),
  setGuestCount: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  callbacks: null as null | {
    onSpinStart: (entry: { id: string; name: string }) => void;
    onLanded: (entry: { id: string; name: string }) => void;
  },
}));
vi.mock('./useDrawPool', () => ({
  useDrawPool: () => ({
    pool: parts.pool,
    guestCount: parts.guestCount,
    drawnCount: parts.drawnCount,
    exclude: parts.exclude,
    clearExclusions: parts.clearExclusions,
    setGuestCount: parts.setGuestCount,
  }),
}));
vi.mock('./useSpinAnimation', () => ({
  useSpinAnimation: (callbacks: NonNullable<typeof parts.callbacks>) => {
    parts.callbacks = callbacks;
    return {
      positionRef: { current: 0 },
      speedRef: { current: 0 },
      start: parts.start,
      stop: parts.stop,
    };
  },
}));
const ada: LuckyDrawEntry = { id: 'ada', name: 'Ada' };
const bo: LuckyDrawEntry = { id: 'bo', name: 'Bo' };
/** jsdom's matchMedia is shared state; pin it explicitly for every test. */
const stubMedia = (reducedMotion: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reducedMotion && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
beforeEach(() => {
  vi.clearAllMocks();
  stubMedia(false);
  parts.pool = [ada, bo];
  parts.guestCount = 300;
  parts.drawnCount = 0;
  parts.callbacks = null;
});
const callbacks = () => parts.callbacks!;
describe('useLuckyDraw', () => {
  it('starts idle with the whole pool available', () => {
    const { result } = renderHook(() => useLuckyDraw({}));

    expect(result.current.phase).toBe('idle');
    expect(result.current.winner).toBeNull();
    expect(result.current.pool).toEqual([ada, bo]);
    expect(result.current.guestCount).toBe(300);
    expect(result.current.drawnCount).toBe(0);
    expect(result.current.positionRef.current).toBe(0);
    expect(result.current.speedRef.current).toBe(0);
  });

  it('spins the whole pool from idle', () => {
    const { result } = renderHook(() => useLuckyDraw({}));

    act(() => result.current.spin());

    expect(parts.start).toHaveBeenCalledWith({ entries: [ada, bo], isReducedMotion: false });
  });

  it('spins without settling when the viewer prefers reduced motion', () => {
    stubMedia(true);
    const { result } = renderHook(() => useLuckyDraw({}));

    act(() => result.current.spin());

    expect(parts.start).toHaveBeenCalledWith({ entries: [ada, bo], isReducedMotion: true });
  });

  it('marks the drum as spinning when the pick is announced', () => {
    const { result } = renderHook(() => useLuckyDraw({}));

    act(() => result.current.spin());
    act(() => callbacks().onSpinStart(ada));

    expect(result.current.phase).toBe('spinning');
    expect(result.current.winner).toEqual(ada);
  });

  it('refuses a second spin while the drum is turning', () => {
    const { result } = renderHook(() => useLuckyDraw({}));

    act(() => result.current.spin());
    act(() => callbacks().onSpinStart(ada));
    act(() => result.current.spin());

    expect(parts.start).toHaveBeenCalledTimes(1);
  });

  it('lands, reports the winner and stops spinning', () => {
    const onLanded = vi.fn();
    const { result } = renderHook(() => useLuckyDraw({ onLanded }));

    act(() => result.current.spin());
    act(() => callbacks().onSpinStart(ada));
    act(() => callbacks().onLanded(ada));

    expect(result.current.phase).toBe('landed');
    expect(onLanded).toHaveBeenCalledWith(ada);
  });

  it('lands without a caller listening', () => {
    const { result } = renderHook(() => useLuckyDraw({}));

    act(() => result.current.spin());
    act(() => callbacks().onLanded(bo));

    expect(result.current.phase).toBe('landed');
  });

  it('redraws from the pool without the last winner', () => {
    parts.exclude.mockReturnValue([bo]);
    const { result } = renderHook(() => useLuckyDraw({}));

    // Nothing has been drawn yet, so there is no winner to exclude.
    act(() => result.current.redraw());
    expect(parts.start).not.toHaveBeenCalled();

    act(() => result.current.spin());
    act(() => callbacks().onSpinStart(ada));
    act(() => callbacks().onLanded(ada));
    act(() => result.current.redraw());

    expect(parts.exclude).toHaveBeenCalledWith(ada);
    expect(parts.start).toHaveBeenLastCalledWith({ entries: [bo], isReducedMotion: false });
  });

  it('resets the drum, the exclusions and the phase', () => {
    const { result } = renderHook(() => useLuckyDraw({}));

    act(() => result.current.spin());
    act(() => callbacks().onSpinStart(ada));
    act(() => result.current.reset());

    expect(parts.stop).toHaveBeenCalledTimes(1);
    expect(parts.clearExclusions).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
    expect(result.current.winner).toBeNull();
  });

  it('changes the guest list and clears the draw', () => {
    const { result } = renderHook(() => useLuckyDraw({}));

    act(() => result.current.setGuestCount(10));

    expect(parts.setGuestCount).toHaveBeenCalledWith(10);
    expect(parts.stop).toHaveBeenCalledTimes(1);
    expect(parts.clearExclusions).toHaveBeenCalledTimes(1);
  });
});
