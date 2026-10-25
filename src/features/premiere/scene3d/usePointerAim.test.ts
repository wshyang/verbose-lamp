// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePointerAim } from './usePointerAim';

describe('usePointerAim live branch', () => {
  it('tracks pointer NDC and removes its listener', () => {
    const store = { getState: () => ({ freezeAt: null }) };
    const { result, unmount } = renderHook(() => usePointerAim(store as never));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 100 });
    act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 25 })));
    expect(result.current.current).toEqual({ x: 0.5, y: 0.5 });
    unmount();
    act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 0, clientY: 100 })));
    expect(result.current.current).toEqual({ x: 0.5, y: 0.5 });
  });

  it('leaves frozen aim untouched', () => {
    const store = { getState: () => ({ freezeAt: 2 }) };
    const { result, unmount } = renderHook(() => usePointerAim(store as never));
    act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 })));
    expect(result.current.current).toEqual({ x: 0, y: 0 });
    unmount();
  });
});
