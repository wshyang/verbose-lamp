// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { useReducedMotion } from './useReducedMotion';

interface FakeMediaQuery {
  matches: boolean;
  media: string;
  listeners: Set<() => void>;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}
function installMatchMedia(matches: boolean): FakeMediaQuery {
  const query: FakeMediaQuery = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    listeners: new Set(),
    addEventListener: (_type, listener) => query.listeners.add(listener),
    removeEventListener: (_type, listener) => query.listeners.delete(listener),
  };
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia;
  return query;
}
describe('useReducedMotion', () => {
  it('reads the initial preference', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('follows the media query and unsubscribes on unmount', () => {
    const query = installMatchMedia(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    query.matches = true;
    act(() => query.listeners.forEach((listener) => listener()));
    expect(result.current).toBe(true);

    expect(query.listeners.size).toBe(1);
    unmount();
    expect(query.listeners.size).toBe(0);
  });
});
