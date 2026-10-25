// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupDomTests } from '@/test/dom';
import { useDemoScreen } from './useDemoScreen';

setupDomTests();

beforeEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('useDemoScreen', () => {
  it('starts on the premiere for an unknown hash', () => {
    const { result } = renderHook(() => useDemoScreen());
    expect(result.current.screen).toBe('premiere');
  });

  it('reads the event-night hash on first render', () => {
    window.history.replaceState({}, '', '/#event-night');
    const { result } = renderHook(() => useDemoScreen());
    expect(result.current.screen).toBe('event-night');
  });

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

  it('stops listening once unmounted', () => {
    const { result, unmount } = renderHook(() => useDemoScreen());
    unmount();

    window.history.replaceState({}, '', '/#event-night');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(result.current.screen).toBe('premiere');
  });
});
