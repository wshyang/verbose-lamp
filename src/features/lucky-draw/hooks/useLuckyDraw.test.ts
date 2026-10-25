// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrawPool } from './useDrawPool';
import { useLuckyDraw } from './useLuckyDraw';

const mocks = vi.hoisted(() => ({
  options: undefined as never,
  spinner: {
    positionRef: { current: 1 },
    speedRef: { current: 2 },
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('@/shared/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('./useSpinAnimation', () => ({
  useSpinAnimation: (options: never) => {
    mocks.options = options;
    return mocks.spinner;
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('useDrawPool', () => {
  it('validates counts, excludes winners, clears, and rejects a one-guest pool', () => {
    const { result } = renderHook(() => useDrawPool());
    expect(result.current.pool).toHaveLength(289);
    const winner = result.current.pool[0];
    let remaining: readonly typeof winner[] = [];
    act(() => { remaining = result.current.exclude(winner); });
    expect(remaining).toHaveLength(288);
    expect(result.current.drawnCount).toBe(1);
    act(() => result.current.clearExclusions());
    expect(result.current.pool).toHaveLength(289);
    act(() => result.current.setGuestCount(2));
    expect(result.current.pool).toHaveLength(2);
    act(() => result.current.setGuestCount(1));
    expect(result.current.pool).toEqual([]);
  });
});

describe('useLuckyDraw', () => {
  it('coordinates spin, landing, redraw exclusions, reset, and guest counts', () => {
    const onLanded = vi.fn();
    const { result } = renderHook(() => useLuckyDraw({ onLanded }));
    act(() => result.current.redraw());
    expect(mocks.spinner.start).not.toHaveBeenCalled();
    act(() => result.current.spin());
    expect(mocks.spinner.start).toHaveBeenCalledWith({
      entries: result.current.pool, isReducedMotion: true,
    });
    const winner = result.current.pool[0];
    const callbacks = mocks.options as unknown as {
      onSpinStart: (entry: typeof winner) => void;
      onLanded: (entry: typeof winner) => void;
    };
    act(() => callbacks.onSpinStart(winner));
    expect(result.current).toMatchObject({ phase: 'spinning', winner });
    act(() => result.current.spin());
    act(() => result.current.redraw());
    expect(mocks.spinner.start).toHaveBeenCalledOnce();
    act(() => callbacks.onLanded(winner));
    expect(onLanded).toHaveBeenCalledWith(winner);
    act(() => result.current.redraw());
    expect(mocks.spinner.start).toHaveBeenLastCalledWith({
      entries: expect.not.arrayContaining([winner]), isReducedMotion: true,
    });
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ phase: 'idle', winner: null, drawnCount: 0 });
    expect(mocks.spinner.stop).toHaveBeenCalled();
    act(() => result.current.setGuestCount(30));
    expect(result.current.pool).toHaveLength(30);
    act(() => result.current.spin());
    expect(mocks.spinner.start).toHaveBeenCalledTimes(3);
  });

  it('landing is safe without an onLanded consumer', () => {
    const { result } = renderHook(() => useLuckyDraw({}));
    const winner = result.current.pool[0];
    const callbacks = mocks.options as unknown as { onLanded: (entry: typeof winner) => void };
    act(() => callbacks.onLanded(winner));
    expect(result.current.phase).toBe('landed');
  });
});
