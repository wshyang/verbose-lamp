// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, beforeEach } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { useDemoScreen } from './useDemoScreen';

import { setupDomTests } from '@/test/dom';

setupDomTests();
beforeEach(() => {
  window.history.replaceState({}, '', '/');
});
describe('useDemoScreen', () => {
  it('switches demos by pushing history', () => {
    const { result } = renderHook(() => useDemoScreen());

    act(() => result.current.openEventNight());
    expect(result.current.screen).toBe('event-night');
    expect(window.location.hash).toBe('#event-night');

    act(() => result.current.openPremiere());
    expect(result.current.screen).toBe('premiere');
    expect(window.location.hash).toBe('');
  });

  it('keeps the query string when returning to the premiere', () => {
    window.history.replaceState({}, '', '/?freezeAt=8');
    const { result } = renderHook(() => useDemoScreen());

    act(() => result.current.openEventNight());
    act(() => result.current.openPremiere());

    expect(window.location.search).toBe('?freezeAt=8');
  });

  it('follows Back and Forward through popstate', () => {
    const { result } = renderHook(() => useDemoScreen());

    act(() => {
      window.history.replaceState({}, '', '/#event-night');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.screen).toBe('event-night');

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.screen).toBe('premiere');
  });
});
