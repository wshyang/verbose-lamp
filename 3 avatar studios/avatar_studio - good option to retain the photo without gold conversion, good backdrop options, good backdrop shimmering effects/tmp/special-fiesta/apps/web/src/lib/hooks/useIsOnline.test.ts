import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsOnline } from './useIsOnline.js';

/**
 * ADR-074 — connectivity for a surface with no sync queue.
 *
 * `navigator.onLine` is read-only, so it is redefined per test rather than assigned. The listener
 * teardown is asserted explicitly: this hook lives on the superadmin console, which stays open all
 * day, and a leaked `online` listener there survives every navigation for the rest of the event.
 */

function setLink(isOnline: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: isOnline, configurable: true });
}

afterEach(() => {
  setLink(true);
  vi.restoreAllMocks();
});

describe('useIsOnline', () => {
  it('starts from whatever the browser already thinks', () => {
    setLink(false);

    expect(renderHook(() => useIsOnline()).result.current).toBe(false);

    setLink(true);

    expect(renderHook(() => useIsOnline()).result.current).toBe(true);
  });

  it('follows the link going down and coming back', () => {
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);

    setLink(false);
    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current).toBe(false);

    setLink(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current).toBe(true);
  });

  /*
   * It re-reads `navigator.onLine` on every event rather than trusting the event's name, so an
   * `offline` event fired while the link is actually up cannot lie to the send guard.
   */
  it('trusts the browser over the event that woke it', () => {
    const { result } = renderHook(() => useIsOnline());

    setLink(true);
    act(() => window.dispatchEvent(new Event('offline')));

    expect(result.current).toBe(true);
  });

  it('stops listening when it goes away', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useIsOnline());

    unmount();

    const removed = remove.mock.calls.map(([name]) => name);
    expect(removed).toContain('online');
    expect(removed).toContain('offline');
  });

  it('ignores events once unmounted', () => {
    const { result, unmount } = renderHook(() => useIsOnline());
    unmount();

    setLink(false);
    act(() => window.dispatchEvent(new Event('offline')));

    // The last value it rendered, not an update after teardown.
    expect(result.current).toBe(true);
  });
});
