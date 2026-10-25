// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { act, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReducedMotion } from './useReducedMotion';

function mockMedia(initial: boolean) {
  let listener: (() => void) | undefined;
  const query = {
    matches: initial,
    addEventListener: vi.fn((_event: string, cb: () => void) => { listener = cb; }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return {
    query,
    change(matches: boolean) {
      query.matches = matches;
      act(() => listener?.());
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('useReducedMotion', () => {
  it('reads the initial preference and follows changes until cleanup', () => {
    const media = mockMedia(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    media.change(true);
    expect(result.current).toBe(true);
    media.change(false);
    expect(result.current).toBe(false);
    unmount();
    expect(media.query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
