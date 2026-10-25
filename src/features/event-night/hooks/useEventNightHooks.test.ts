// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AMBIENT_START_DELAY_MS, useAmbientShow } from './useAmbientShow';
import { useEventNight } from './useEventNight';

const mocks = vi.hoisted(() => ({
  play: vi.fn(),
  pointFromElement: vi.fn(() => ({ x: 0.2, y: 2 })),
}));

vi.mock('@/features/spectacle', () => ({
  useSpectacle: () => ({ play: mocks.play }),
  pointFromElement: mocks.pointFromElement,
}));

const ITEMS = [
  { id: 'foyer', emoji: '🏛️', label: 'Foyer' },
  { id: 'toast', emoji: '🥂', label: 'Toast' },
  { id: 'draw', emoji: '🎰', label: 'Lucky Draw' },
] as const;

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('useAmbientShow', () => {
  it('starts once after readiness using the latest start callback', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderHook(
      (props: { isReady: boolean; start: () => void }) => useAmbientShow(props),
      { initialProps: { isReady: false, start: first } }
    );
    act(() => vi.advanceTimersByTime(AMBIENT_START_DELAY_MS));
    rerender({ isReady: true, start: first });
    rerender({ isReady: true, start: latest });
    act(() => vi.advanceTimersByTime(AMBIENT_START_DELAY_MS - 1));
    expect(latest).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    rerender({ isReady: false, start: latest });
    rerender({ isReady: true, start: latest });
    act(() => vi.advanceTimersByTime(AMBIENT_START_DELAY_MS));
    expect(latest).toHaveBeenCalledOnce();
  });

  it('cancels the pending start on unmount', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const { unmount } = renderHook(() => useAmbientShow({ isReady: true, start }));
    unmount();
    act(() => vi.advanceTimersByTime(AMBIENT_START_DELAY_MS));
    expect(start).not.toHaveBeenCalled();
  });
});

describe('useEventNight', () => {
  it('ignores unknown nav ids and opens the draw without a transition', () => {
    const { result } = renderHook(() => useEventNight(ITEMS));
    act(() => result.current.selectNav('missing'));
    expect(result.current.isDrawOpen).toBe(false);
    act(() => result.current.selectNav('draw'));
    expect(result.current).toMatchObject({ isDrawOpen: true, activeId: 'draw' });
    expect(mocks.play).not.toHaveBeenCalled();
    act(() => result.current.closeDraw());
    act(() => result.current.openDraw());
    expect(result.current.isDrawOpen).toBe(true);
  });

  it('celebrates landed winners with a time-derived seed and subtitle fallback', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456);
    const { result } = renderHook(() => useEventNight(ITEMS));
    act(() => result.current.handleLanded({ id: '1', name: 'Daisy' }));
    act(() => result.current.handleLanded({ id: '2', name: 'Nick', subtitle: 'Narrator' }));
    expect(mocks.play).toHaveBeenCalledWith('confetti', {
      mode: 'burst', origin: { x: 0.5, y: 0.4 }, seed: 23456,
    });
    expect(mocks.play).toHaveBeenCalledWith('name-reveal', { name: 'Daisy', subtitle: 'Lucky draw winner' });
    expect(mocks.play).toHaveBeenLastCalledWith('name-reveal', { name: 'Nick', subtitle: 'Narrator' });
  });
});
