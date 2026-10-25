// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavItem } from '@/features/gilded-ui';
import { OPENING_TAGLINE } from './data/sectionTaglines';
import { AMBIENT_START_DELAY_MS, useAmbientShow } from './hooks/useAmbientShow';
import { useEventNight } from './hooks/useEventNight';
import { useSpeakerDrag } from './hooks/useSpeakerDrag';

const spectacle = vi.hoisted(() => ({ play: vi.fn() }));

vi.mock('@/features/spectacle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle')>()),
  useSpectacle: () => ({ play: spectacle.play }),
}));

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'nav-0-program', emoji: '🎷', label: 'Program' },
  { id: 'nav-1-toast', emoji: '🥂', label: 'Toast' },
  { id: 'nav-2-lucky-draw', emoji: '🎰', label: 'Lucky Draw' },
];

function pointer(overrides: Partial<{ pointerId: number; movementX: number; movementY: number }> = {}) {
  return {
    currentTarget: { setPointerCapture: vi.fn() },
    pointerId: 1,
    movementX: 100,
    movementY: 50,
    ...overrides,
  } as unknown as ReactPointerEvent<HTMLElement>;
}

describe('useSpeakerDrag', () => {
  it('reports movement as viewport fractions only while dragging', () => {
    const move = vi.fn();
    const { result } = renderHook(() => useSpeakerDrag(move));

    act(() => result.current.onPointerMove(pointer()));
    expect(move).not.toHaveBeenCalled();

    act(() => result.current.onPointerDown(pointer()));
    act(() => result.current.onPointerMove(pointer()));
    expect(move).toHaveBeenCalledWith(100 / window.innerWidth, 50 / window.innerHeight);

    act(() => result.current.onPointerUp());
    move.mockClear();
    act(() => result.current.onPointerMove(pointer()));
    expect(move).not.toHaveBeenCalled();
  });
});

describe('useAmbientShow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the stage and then starts the show once', () => {
    const start = vi.fn();
    const { rerender } = renderHook(({ isReady }) => useAmbientShow({ isReady, start }), {
      initialProps: { isReady: false },
    });

    act(() => vi.advanceTimersByTime(AMBIENT_START_DELAY_MS * 2));
    expect(start).not.toHaveBeenCalled();

    rerender({ isReady: true });
    act(() => vi.advanceTimersByTime(AMBIENT_START_DELAY_MS - 1));
    expect(start).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(start).toHaveBeenCalledOnce();

    rerender({ isReady: false });
    rerender({ isReady: true });
    act(() => vi.advanceTimersByTime(AMBIENT_START_DELAY_MS * 2));
    expect(start).toHaveBeenCalledOnce();
  });

  it('cancels the pending start on unmount', () => {
    const start = vi.fn();
    const { unmount } = renderHook(() => useAmbientShow({ isReady: true, start }));
    unmount();
    act(() => vi.advanceTimersByTime(AMBIENT_START_DELAY_MS * 2));
    expect(start).not.toHaveBeenCalled();
  });

  it('uses the latest start callback when the timer fires', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ start }) => useAmbientShow({ isReady: true, start }), {
      initialProps: { start: first },
    });
    rerender({ start: second });
    act(() => vi.advanceTimersByTime(AMBIENT_START_DELAY_MS));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});

describe('useEventNight', () => {
  beforeEach(() => {
    spectacle.play.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts closed on the opening tagline with the first nav item active', () => {
    const { result } = renderHook(() => useEventNight(NAV_ITEMS));
    expect(result.current.tagline).toBe(OPENING_TAGLINE);
    expect(result.current.isDrawOpen).toBe(false);
    expect(result.current.activeId).toBe(NAV_ITEMS[0].id);
  });

  it('opens the draw from a nav item that mentions it', () => {
    const { result } = renderHook(() => useEventNight(NAV_ITEMS));
    act(() => result.current.selectNav('nav-2-lucky-draw'));
    expect(result.current.isDrawOpen).toBe(true);
    expect(result.current.activeId).toBe('nav-2-lucky-draw');
    act(() => result.current.closeDraw());
    expect(result.current.isDrawOpen).toBe(false);
    act(() => result.current.openDraw());
    expect(result.current.isDrawOpen).toBe(true);
  });

  it('ignores an unknown nav id', () => {
    const { result } = renderHook(() => useEventNight(NAV_ITEMS));
    act(() => result.current.selectNav('nope'));
    expect(result.current.activeId).toBe(NAV_ITEMS[0].id);
    expect(spectacle.play).not.toHaveBeenCalled();
  });

  it('covers the screen with a transition, then sets the tagline', () => {
    const nav = document.createElement('div');
    nav.getBoundingClientRect = () => ({ left: 0, top: 700, width: 0, height: 0 }) as DOMRect;
    const { result } = renderHook(() => useEventNight(NAV_ITEMS));
    (result.current.navRef as { current: HTMLDivElement | null }).current = nav;

    act(() => result.current.selectNav('nav-0-program'));
    expect(spectacle.play).toHaveBeenCalledWith(
      'orb-transition',
      expect.objectContaining({
        pattern: 'sides',
        direction: 'outward',
        durationMs: 1300,
        // A zero-width bar at (0, 700): the centre is x=0, y≈0.91 in a 768 px viewport.
        origin: { x: 0, y: Math.min(700 / window.innerHeight, 0.96) },
      })
    );

    const params = spectacle.play.mock.calls[0][1] as { onCovered: () => void };
    act(() => params.onCovered());
    expect(result.current.tagline).toBe('THREE SETS OF JAZZ UNTIL THE SMALL HOURS');
  });

  it('rains confetti when the section is the toast', () => {
    const { result } = renderHook(() => useEventNight(NAV_ITEMS));
    act(() => result.current.selectNav('nav-1-toast'));
    const params = spectacle.play.mock.calls[0][1] as { onCovered: () => void };
    act(() => params.onCovered());
    expect(spectacle.play).toHaveBeenLastCalledWith('confetti', { mode: 'rain', durationMs: 2600 });
  });

  it('falls back to the default nav origin without a nav element', () => {
    const { result } = renderHook(() => useEventNight(NAV_ITEMS));
    act(() => result.current.selectNav('nav-0-program'));
    expect(spectacle.play).toHaveBeenCalledWith(
      'orb-transition',
      expect.objectContaining({ origin: { x: 0.5, y: 0.95 } })
    );
  });

  it('celebrates the landed winner with a burst and the name reveal', () => {
    const { result } = renderHook(() => useEventNight(NAV_ITEMS));
    act(() => result.current.handleLanded({ id: 'g1', name: 'Jordan Baker', subtitle: 'Table 4' }));

    expect(spectacle.play).toHaveBeenNthCalledWith(1, 'confetti', {
      mode: 'burst',
      origin: { x: 0.5, y: 0.4 },
      seed: expect.any(Number),
    });
    expect(spectacle.play).toHaveBeenNthCalledWith(2, 'name-reveal', {
      name: 'Jordan Baker',
      subtitle: 'Table 4',
    });
  });

  it('labels a winner without a subtitle as the lucky draw winner', () => {
    const { result } = renderHook(() => useEventNight(NAV_ITEMS));
    act(() => result.current.handleLanded({ id: 'g2', name: 'Meyer Wolfsheim' }));
    expect(spectacle.play).toHaveBeenLastCalledWith('name-reveal', {
      name: 'Meyer Wolfsheim',
      subtitle: 'Lucky draw winner',
    });
  });

  it('falls back to an empty active id for an empty bar', () => {
    const { result } = renderHook(() => useEventNight([]));
    expect(result.current.activeId).toBe('');
  });
});
