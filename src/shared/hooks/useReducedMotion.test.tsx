// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

type Listener = () => void;

function mediaQuery(matches: boolean) {
  const listeners: Listener[] = [];
  const query = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, listener: Listener) => listeners.push(listener),
    removeEventListener: vi.fn((_: string, listener: Listener) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    }),
    trigger(next: boolean) {
      query.matches = next;
      for (const listener of listeners) listener();
    },
  };
  return query;
}

describe('useReducedMotion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the media query on first render', () => {
    const query = mediaQuery(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('follows a change and unsubscribes on unmount', () => {
    const query = mediaQuery(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => query.trigger(true));
    expect(result.current).toBe(true);

    unmount();
    expect(query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
