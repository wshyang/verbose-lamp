// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { EVENT_NIGHT_HASH } from '../model/demoScreen';

import { useDemoScreen } from './useDemoScreen';

function navigateTo(url: string) {
  window.history.replaceState(null, '', url);
}
afterEach(() => {
  vi.restoreAllMocks();
  navigateTo('/');
});
describe('useDemoScreen', () => {
  it('starts on the premiere for an unrecognised hash', () => {
    navigateTo('/#unknown');
    const { result } = renderHook(() => useDemoScreen());
    expect(result.current.screen).toBe('premiere');
  });

  it('starts on the event night when the hash says so', () => {
    navigateTo(`/${EVENT_NIGHT_HASH}`);
    const { result } = renderHook(() => useDemoScreen());
    expect(result.current.screen).toBe('event-night');
  });

  it('pushes the hash and switches screens, then returns keeping the search string', () => {
    navigateTo('/?freezeAt=2');
    const { result } = renderHook(() => useDemoScreen());

    act(() => result.current.openEventNight());
    expect(result.current.screen).toBe('event-night');
    expect(window.location.hash).toBe(EVENT_NIGHT_HASH);

    act(() => result.current.openPremiere());
    expect(result.current.screen).toBe('premiere');
    expect(window.location.search).toBe('?freezeAt=2');
    expect(window.location.hash).toBe('');
  });

  it('follows popstate navigation and unsubscribes on unmount', () => {
    navigateTo('/');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() => useDemoScreen());

    window.history.pushState(null, '', `/${EVENT_NIGHT_HASH}`);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.screen).toBe('event-night');

    unmount();
    expect(removeListener).toHaveBeenCalledWith('popstate', expect.any(Function));
  });
});
