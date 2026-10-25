// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MarqueeBorder } from './MarqueeBorder';

function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MarqueeBorder', () => {
  it('lays out one bulb per perimeter position', () => {
    render(<MarqueeBorder bulbCount={12} />);
    const bulbs = screen.getAllByTestId('marquee-border__bulb');
    expect(bulbs).toHaveLength(12);
    expect(bulbs[0].style.left).toBe('0%');
    expect(bulbs[0].style.top).toBe('0%');
    expect(bulbs[3].style.left).toBe('100%');
    expect(bulbs[6].style.top).toBe('100%');
    expect(bulbs[9].style.left).toBe('0%');
  });

  it('chases the bulbs on a timer', () => {
    vi.useFakeTimers();
    stubMatchMedia(false);
    render(<MarqueeBorder bulbCount={8} mode="chase" />);
    const first = screen.getAllByTestId('marquee-border__bulb');
    const before = first.map((bulb) => bulb.style.opacity);

    act(() => {
      vi.advanceTimersByTime(420);
    });
    const after = screen.getAllByTestId('marquee-border__bulb').map((bulb) => bulb.style.opacity);
    expect(after).not.toEqual(before);
  });

  it('holds every bulb lit and skips the timer for reduced motion', () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    render(<MarqueeBorder bulbCount={6} />);
    const bulbs = screen.getAllByTestId('marquee-border__bulb');
    const opacities = bulbs.map((bulb) => bulb.style.opacity);
    expect(new Set(opacities).size).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its interval on unmount', () => {
    vi.useFakeTimers();
    stubMatchMedia(false);
    const { unmount } = render(<MarqueeBorder bulbCount={4} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
