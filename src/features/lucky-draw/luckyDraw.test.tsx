// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrawPool } from './hooks/useDrawPool';
import { useDrumCanvas } from './hooks/useDrumCanvas';
import { useLuckyDraw } from './hooks/useLuckyDraw';
import { useSpinAnimation } from './hooks/useSpinAnimation';
import type { LuckyDrawEntry } from './model/entries';
import { pickWinner } from './model/pickWinner';

const ENTRIES: readonly LuckyDrawEntry[] = [
  { id: 'a', name: 'Nick' },
  { id: 'b', name: 'Jordan' },
  { id: 'c', name: 'Daisy' },
  { id: 'd', name: 'Tom' },
];

let frames: FrameRequestCallback[] = [];

function pumpFrame(at: number): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(at);
}

describe('pickWinner', () => {
  it('indexes the pool from the crypto fill, never from Math.random', () => {
    const fill = (buf: Uint32Array) => {
      buf[0] = 2;
      return buf;
    };
    expect(pickWinner(ENTRIES, fill)).toBe(ENTRIES[2]);
  });

  it('defaults to crypto.getRandomValues', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(((buf: Uint32Array) => {
      buf[0] = 1;
      return buf;
    }) as typeof crypto.getRandomValues);
    expect(pickWinner(ENTRIES)).toBe(ENTRIES[1]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('useDrawPool', () => {
  it('validates the sample guests and keeps every guest in the drum', () => {
    const { result } = renderHook(() => useDrawPool());
    expect(result.current.guestCount).toBe(300);
    expect(result.current.pool.length).toBeGreaterThan(100);
    expect(result.current.drawnCount).toBe(0);
  });

  it('removes a winner and reports the smaller pool immediately', () => {
    const { result } = renderHook(() => useDrawPool());
    const [first] = result.current.pool;
    let remaining: readonly LuckyDrawEntry[] = [];
    act(() => {
      remaining = result.current.exclude(first);
    });
    expect(remaining).toHaveLength(result.current.pool.length);
    expect(remaining.some((entry) => entry.id === first.id)).toBe(false);
    expect(result.current.drawnCount).toBe(1);
  });

  it('clears the exclusions and accepts a smaller guest list', () => {
    const { result } = renderHook(() => useDrawPool());
    const [first] = result.current.pool;
    act(() => {
      result.current.exclude(first);
    });
    expect(result.current.pool.some((entry) => entry.id === first.id)).toBe(false);

    act(() => result.current.clearExclusions());
    expect(result.current.pool.some((entry) => entry.id === first.id)).toBe(true);

    act(() => result.current.setGuestCount(10));
    expect(result.current.pool).toHaveLength(10);
  });

  it('falls back to an empty pool when the slice does not validate', () => {
    const { result } = renderHook(() => useDrawPool());
    act(() => result.current.setGuestCount(1));
    expect(result.current.pool).toEqual([]);
  });
});

describe('useSpinAnimation', () => {
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refuses to spin fewer than two entries', () => {
    const onSpinStart = vi.fn();
    const { result } = renderHook(() => useSpinAnimation({ onSpinStart, onLanded: vi.fn() }));
    act(() => result.current.start({ entries: [ENTRIES[0]], isReducedMotion: false }));
    expect(onSpinStart).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it('picks the winner first, then plays the spin out frame by frame', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const onSpinStart = vi.fn();
    const onLanded = vi.fn();
    const { result } = renderHook(() => useSpinAnimation({ onSpinStart, onLanded }));

    act(() => result.current.start({ entries: ENTRIES, isReducedMotion: true }));
    expect(onSpinStart).toHaveBeenCalledOnce();
    const picked = onSpinStart.mock.calls[0][0] as LuckyDrawEntry;
    expect(ENTRIES).toContain(picked);
    expect(frames).toHaveLength(1);

    now = 100;
    act(() => pumpFrame(100));
    expect(result.current.positionRef.current).not.toBe(0);
    expect(frames).toHaveLength(1);

    now = 10_000;
    act(() => pumpFrame(10_000));
    expect(onLanded).toHaveBeenCalledWith(picked);
    expect(result.current.speedRef.current).toBe(0);
  });

  it('stops the loop on demand and on unmount', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { result, unmount } = renderHook(() =>
      useSpinAnimation({ onSpinStart: vi.fn(), onLanded: vi.fn() })
    );
    act(() => result.current.start({ entries: ENTRIES, isReducedMotion: false }));
    act(() => result.current.stop());
    expect(result.current.speedRef.current).toBe(0);
    expect(frames).toHaveLength(0);
    expect(() => unmount()).not.toThrow();
  });
});

describe('useLuckyDraw', () => {
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function land(): void {
    act(() => pumpFrame(0));
    act(() => pumpFrame(1_000_000));
  }

  it('walks idle → spinning → landed and reports the winner', () => {
    const onLanded = vi.fn();
    const { result } = renderHook(() => useLuckyDraw({ onLanded }));
    expect(result.current.phase).toBe('idle');

    act(() => result.current.spin());
    expect(result.current.phase).toBe('spinning');
    const winner = result.current.winner;
    expect(winner).not.toBeNull();

    land();
    expect(result.current.phase).toBe('landed');
    expect(onLanded).toHaveBeenCalledWith(winner);
  });

  it('works without an onLanded callback', () => {
    const { result } = renderHook(() => useLuckyDraw({}));
    act(() => result.current.spin());
    land();
    expect(result.current.phase).toBe('landed');
  });

  it('ignores a second spin and a redraw while spinning', () => {
    const { result } = renderHook(() => useLuckyDraw({}));
    act(() => result.current.spin());
    const winner = result.current.winner;
    act(() => result.current.spin());
    act(() => result.current.redraw());
    expect(result.current.winner).toBe(winner);
  });

  it('redraws from a pool without the previous winner', () => {
    const onLanded = vi.fn();
    const { result } = renderHook(() => useLuckyDraw({ onLanded }));
    act(() => result.current.spin());
    land();
    const first = result.current.winner;

    act(() => result.current.redraw());
    expect(result.current.phase).toBe('spinning');
    land();
    expect(result.current.winner).not.toBe(first);
    expect(result.current.drawnCount).toBe(1);
  });

  it('ignores a redraw before anyone has won', () => {
    const { result } = renderHook(() => useLuckyDraw({}));
    act(() => result.current.redraw());
    expect(result.current.phase).toBe('idle');
  });

  it('resets the draw and the pool when the guest count changes', () => {
    const { result } = renderHook(() => useLuckyDraw({}));
    act(() => result.current.spin());
    land();
    act(() => result.current.setGuestCount(20));
    expect(result.current.phase).toBe('idle');
    expect(result.current.winner).toBeNull();
    expect(result.current.guestCount).toBe(20);
    expect(result.current.drawnCount).toBe(0);
    expect(result.current.pool).toHaveLength(20);
  });

  it('resets after a first draw', () => {
    const { result } = renderHook(() => useLuckyDraw({}));
    act(() => result.current.spin());
    land();
    act(() => result.current.reset());
    expect(result.current.phase).toBe('idle');
    expect(result.current.winner).toBeNull();
  });
});

describe('useDrumCanvas', () => {
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function feed(pool: readonly LuckyDrawEntry[] = ENTRIES) {
    return {
      pool,
      isLanded: false,
      positionRef: { current: 1.5 },
      speedRef: { current: 2 },
    };
  }

  /**
   * The hook owns its refs, so the harness fills them during render — before the
   * layout effect that starts the loop reads them.
   */
  function Harness({ drumFeed, canvas, sway }: { drumFeed: ReturnType<typeof feed>; canvas: HTMLCanvasElement; sway: HTMLDivElement }) {
    const refs = useDrumCanvas(drumFeed);
    if (!refs.canvasRef.current) (refs.canvasRef as { current: HTMLCanvasElement | null }).current = canvas;
    if (!refs.swayRef.current) (refs.swayRef as { current: HTMLDivElement | null }).current = sway;
    return null;
  }

  it('sizes the canvas for the device and draws every frame', () => {
    const canvas = document.createElement('canvas');
    const getContext = vi.spyOn(canvas, 'getContext');
    render(<Harness drumFeed={feed()} canvas={canvas} sway={document.createElement('div')} />);

    expect(getContext).toHaveBeenCalledWith('2d');
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(400);
    expect(frames).toHaveLength(1);
    act(() => pumpFrame(0));
    expect(frames).toHaveLength(1);
  });

  it('sways the frame on a slow bob and stops when the drum unmounts', () => {
    const sway = document.createElement('div');
    const { unmount } = render(<Harness drumFeed={feed()} canvas={document.createElement('canvas')} sway={sway} />);
    act(() => pumpFrame(1_500));
    expect(sway.style.transform).toContain('translateY(');
    expect(sway.style.transform).toContain('rotate(');
    unmount();
    expect(frames).toHaveLength(0);
  });

  it('holds the frame still under reduced motion', () => {
    const reduced = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList);
    const sway = document.createElement('div');
    render(<Harness drumFeed={feed()} canvas={document.createElement('canvas')} sway={sway} />);
    act(() => pumpFrame(1_500));
    expect(sway.style.transform).toBe('');
    reduced.mockRestore();
  });

  it('falls back to placeholder names while the pool is too small', () => {
    const single = feed([ENTRIES[0]]);
    const canvas = document.createElement('canvas');
    const getContext = vi.spyOn(canvas, 'getContext');
    render(<Harness drumFeed={single} canvas={canvas} sway={document.createElement('div')} />);
    act(() => pumpFrame(100));
    expect(getContext).toHaveBeenCalled();
  });

  it('does nothing without a canvas', () => {
    const { result } = renderHook(() => useDrumCanvas(feed()));
    expect(result.current.canvasRef.current).toBeNull();
    expect(frames).toHaveLength(0);
  });
});
