// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT_NIGHT_HASH } from '../model/demoScreen';
import { useDemoScreen } from './useDemoScreen';
import { useWinnerCelebration } from './useWinnerCelebration';

const spectacle = vi.hoisted(() => ({ play: vi.fn() }));

vi.mock('@/features/spectacle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle')>()),
  useSpectacle: () => ({ play: spectacle.play }),
}));

function resetUrl(path = '/'): void {
  window.history.replaceState({}, '', path);
}

describe('useDemoScreen', () => {
  afterEach(() => resetUrl());

  it('starts on the premiere and opens the event night through the URL hash', () => {
    resetUrl('/');
    const { result } = renderHook(() => useDemoScreen());
    expect(result.current.screen).toBe('premiere');

    act(() => result.current.openEventNight());
    expect(window.location.hash).toBe(EVENT_NIGHT_HASH);
    expect(result.current.screen).toBe('event-night');

    act(() => result.current.openPremiere());
    expect(result.current.screen).toBe('premiere');
    expect(window.location.hash).toBe('');
  });

  it('starts on the event night when the URL already points there', () => {
    resetUrl(`/${EVENT_NIGHT_HASH}`);
    const { result } = renderHook(() => useDemoScreen());
    expect(result.current.screen).toBe('event-night');
  });

  it('follows the browser history between demos', () => {
    resetUrl('/');
    const { result } = renderHook(() => useDemoScreen());
    act(() => result.current.openEventNight());
    window.history.replaceState({}, '', '/');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.screen).toBe('premiere');
  });

  it('stops listening after unmount', () => {
    resetUrl('/');
    const { result, unmount } = renderHook(() => useDemoScreen());
    unmount();
    window.history.replaceState({}, '', `/${EVENT_NIGHT_HASH}`);
    expect(() => window.dispatchEvent(new PopStateEvent('popstate'))).not.toThrow();
    expect(result.current.screen).toBe('premiere');
  });
});

describe('useWinnerCelebration', () => {
  afterEach(() => spectacle.play.mockReset());

  it('bursts confetti and then prints the winner name', () => {
    const { result } = renderHook(() => useWinnerCelebration());
    act(() => result.current({ id: 'g1', name: 'Daisy Buchanan' }));

    expect(spectacle.play).toHaveBeenNthCalledWith(1, 'confetti', {
      mode: 'burst',
      origin: { x: 0.5, y: 0.55 },
      seed: 1925,
    });
    expect(spectacle.play).toHaveBeenNthCalledWith(2, 'name-reveal', {
      name: 'Daisy Buchanan',
      subtitle: 'Lucky draw winner',
    });
  });

  it('keeps the callback stable across renders', () => {
    const { result, rerender } = renderHook(() => useWinnerCelebration());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
