// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { type LuckyDrawEntry } from '../model/entries';

import { SAMPLE_GUESTS } from '../data/sampleGuests';

import { useLuckyDraw } from './useLuckyDraw';

import { useSpinAnimation } from './useSpinAnimation';

import { useDrawPool } from './useDrawPool';

import { useDrumCanvas } from './useDrumCanvas';

type FrameCallback = (now: number) => void;
let frames: FrameCallback[] = [];
let now = 0;
function runFramesUntil(predicate: () => boolean, limit = 400) {
  act(() => {
    let guard = 0;
    while (!predicate() && guard < limit) {
      guard += 1;
      now += 100;
      const pending = frames;
      frames = [];
      for (const frame of pending) frame(now);
    }
  });
}
beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('useSpinAnimation', () => {
  const entries: LuckyDrawEntry[] = [
    { id: 'a', name: 'Ada' },
    { id: 'b', name: 'Bertie' },
    { id: 'c', name: 'Cora' },
  ];

  it('picks a winner, plays it out and lands', () => {
    const onSpinStart = vi.fn();
    const onLanded = vi.fn();
    const { result } = renderHook(() => useSpinAnimation({ onSpinStart, onLanded }));

    act(() => result.current.start({ entries, isReducedMotion: false }));
    expect(onSpinStart).toHaveBeenCalledTimes(1);
    expect(entries).toContainEqual(onSpinStart.mock.calls[0][0]);
    expect(frames).toHaveLength(1);

    runFramesUntil(() => onLanded.mock.calls.length > 0);
    expect(onLanded).toHaveBeenCalledTimes(1);
    expect(result.current.positionRef.current).toBeGreaterThan(0);
  });

  it('uses a short settle-free profile for reduced motion', () => {
    const onLanded = vi.fn();
    const { result } = renderHook(() => useSpinAnimation({ onSpinStart: vi.fn(), onLanded }));

    act(() => result.current.start({ entries, isReducedMotion: true }));
    runFramesUntil(() => onLanded.mock.calls.length > 0, 100);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it('ignores a pool with fewer than two guests', () => {
    const onSpinStart = vi.fn();
    const { result } = renderHook(() => useSpinAnimation({ onSpinStart, onLanded: vi.fn() }));
    act(() => result.current.start({ entries: [{ id: 'a', name: 'Ada' }], isReducedMotion: false }));
    expect(onSpinStart).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it('stops the loop and zeroes the speed', () => {
    const { result } = renderHook(() => useSpinAnimation({ onSpinStart: vi.fn(), onLanded: vi.fn() }));
    act(() => result.current.start({ entries, isReducedMotion: false }));
    act(() => result.current.stop());
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(result.current.speedRef.current).toBe(0);
  });

  it('cancels the pending frame on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useSpinAnimation({ onSpinStart: vi.fn(), onLanded: vi.fn() }),
    );
    act(() => result.current.start({ entries, isReducedMotion: false }));
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
describe('useDrawPool', () => {
  it('starts with three hundred guests that shrink as winners are drawn', () => {
    const { result } = renderHook(() => useDrawPool());
    expect(result.current.guestCount).toBe(300);
    expect(result.current.pool).toHaveLength(SAMPLE_GUESTS.length);
    expect(result.current.drawnCount).toBe(0);

    const [first] = result.current.pool;
    let remaining: readonly LuckyDrawEntry[] = [];
    act(() => {
      remaining = result.current.exclude(first);
    });
    expect(remaining).toHaveLength(SAMPLE_GUESTS.length - 1);
    expect(result.current.drawnCount).toBe(1);
    expect(result.current.pool.some((entry) => entry.id === first.id)).toBe(false);

    act(() => result.current.clearExclusions());
    expect(result.current.drawnCount).toBe(0);
    expect(result.current.pool).toHaveLength(SAMPLE_GUESTS.length);
  });

  it('resizes the drum to the requested guest count', () => {
    const { result } = renderHook(() => useDrawPool());
    act(() => result.current.setGuestCount(5));
    expect(result.current.guestCount).toBe(5);
    expect(result.current.pool).toHaveLength(5);

    act(() => result.current.setGuestCount(1));
    expect(result.current.pool).toHaveLength(0);
  });
});
describe('useLuckyDraw', () => {
  const settle = () => runFramesUntil(() => true, 400);

  it('moves idle → spinning → landed and reports the winner', () => {
    const onLanded = vi.fn();
    const { result } = renderHook(() => useLuckyDraw({ onLanded }));
    expect(result.current.phase).toBe('idle');

    act(() => result.current.spin());
    expect(result.current.phase).toBe('spinning');
    expect(result.current.winner).not.toBeNull();

    runFramesUntil(() => onLanded.mock.calls.length > 0);
    expect(result.current.phase).toBe('landed');
    expect(onLanded).toHaveBeenCalledWith(result.current.winner);
  });

  it('ignores a second spin while one is running', () => {
    const { result } = renderHook(() => useLuckyDraw({}));
    act(() => result.current.spin());
    const firstWinner = result.current.winner;
    act(() => result.current.spin());
    expect(result.current.winner).toBe(firstWinner);
  });

  it('redraws without the previous winner and clears on reset', () => {
    const { result } = renderHook(() => useLuckyDraw({}));
    act(() => result.current.spin());
    runFramesUntil(() => result.current.phase === 'landed');
    const firstWinner = result.current.winner!;

    act(() => result.current.redraw());
    expect(result.current.winner).not.toBeNull();
    expect(result.current.winner?.id).not.toBe(firstWinner.id);
    expect(result.current.drawnCount).toBe(1);

    act(() => result.current.reset());
    expect(result.current.phase).toBe('idle');
    expect(result.current.winner).toBeNull();
    expect(result.current.drawnCount).toBe(0);
  });

  it('does not redraw before anyone has won', () => {
    const { result } = renderHook(() => useLuckyDraw({}));
    act(() => result.current.redraw());
    expect(result.current.phase).toBe('idle');
    expect(result.current.drawnCount).toBe(0);
    settle();
  });

  it('resets the draw when the guest count changes', () => {
    const { result } = renderHook(() => useLuckyDraw({}));
    act(() => result.current.spin());
    runFramesUntil(() => result.current.phase === 'landed');
    act(() => result.current.setGuestCount(12));
    expect(result.current.guestCount).toBe(12);
    expect(result.current.pool).toHaveLength(12);
    expect(result.current.phase).toBe('idle');
    expect(result.current.winner).toBeNull();
  });
});
describe('useDrumCanvas', () => {
  function feed(overrides: Record<string, unknown> = {}) {
    return {
      pool: [
        { id: 'a', name: 'Ada' },
        { id: 'b', name: 'Bertie' },
      ],
      isLanded: false,
      positionRef: { current: 0.25 },
      speedRef: { current: 2 },
      ...overrides,
    } as never;
  }

  it('sizes the canvas for the device pixel ratio and paints each frame', () => {
    const { result } = renderHook(() => useDrumCanvas(feed()));
    const canvas = document.createElement('canvas');
    const sway = document.createElement('div');
    (result.current.canvasRef as { current: HTMLCanvasElement | null }).current = canvas;
    (result.current.swayRef as { current: HTMLDivElement | null }).current = sway;

    expect(canvas.getContext).toBeDefined();
  });

  it('sways the frame when motion is allowed', () => {
    const feedValue = feed();
    const { result } = renderHook(() => useDrumCanvas(feedValue));
    const canvas = document.createElement('canvas');
    const context = document.createElement('canvas').getContext('2d')!;
    canvas.getContext = (() => context) as unknown as HTMLCanvasElement['getContext'];
    const sway = document.createElement('div');
    (result.current.canvasRef as { current: HTMLCanvasElement | null }).current = canvas;
    (result.current.swayRef as { current: HTMLDivElement | null }).current = sway;

    runFramesUntil(() => frames.length === 0, 2);
    expect(canvas.width).toBeGreaterThan(0);
  });

  it('renders placeholders for a pool that is too small', () => {
    const { result } = renderHook(() => useDrumCanvas(feed({ pool: [{ id: 'a', name: 'Ada' }] })));
    const canvas = document.createElement('canvas');
    (result.current.canvasRef as { current: HTMLCanvasElement | null }).current = canvas;
    expect(result.current.canvasRef.current).toBe(canvas);
  });
});
