// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

import { act, render, screen } from '@testing-library/react';

import { MarqueeBorder } from './MarqueeBorder';

import { setupDomTests } from '@/test/dom';

import { chasePattern } from '../model/chasePattern';

setupDomTests();
/** jsdom's matchMedia is shared state; pin it explicitly for every test. */
const stubMedia = (reducedMotion: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reducedMotion && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
const bulbs = () => screen.getAllByTestId('marquee-border__bulb');
beforeEach(() => {
  stubMedia(false);
});
afterEach(() => {
  vi.useRealTimers();
});
describe('MarqueeBorder', () => {
  it('rings the frame with the requested number of bulbs', () => {
    render(<MarqueeBorder bulbCount={10} />);

    expect(bulbs()).toHaveLength(10);
  });

  it('defaults to 56 bulbs', () => {
    render(<MarqueeBorder />);

    expect(bulbs()).toHaveLength(56);
  });

  it('walks the perimeter clockwise from the top-left', () => {
    render(<MarqueeBorder bulbCount={8} />);

    const corners = bulbs().map((bulb) => `${bulb.style.left},${bulb.style.top}`);
    expect(corners[0]).toBe('0%,0%');
    expect(corners[2]).toBe('100%,0%');
    expect(corners[4]).toBe('100%,100%');
    expect(corners[6]).toBe('0%,100%');
  });

  it('is a decorative, non-interactive overlay', () => {
    const { container } = render(<MarqueeBorder className="rounded-xl" />);
    const overlay = container.firstElementChild!;

    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.className).toContain('rounded-xl');
  });

  it('chases the bulbs as the frame advances', () => {
    vi.useFakeTimers();
    render(<MarqueeBorder bulbCount={12} mode="chase" />);

    const before = bulbs().map((bulb) => bulb.style.opacity);
    act(() => {
      vi.advanceTimersByTime(140);
    });
    const after = bulbs().map((bulb) => bulb.style.opacity);

    expect(after).not.toEqual(before);
    // The same pure chase the model computes, one frame in.
    expect(Number(after[0])).toBeCloseTo(0.35 + chasePattern(0, 1, 'chase') * 0.65, 5);
  });

  it('holds every bulb steady when the viewer prefers reduced motion', () => {
    stubMedia(true);
    vi.useFakeTimers();
    render(<MarqueeBorder bulbCount={6} />);

    const before = bulbs().map((bulb) => bulb.style.opacity);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(bulbs().map((bulb) => bulb.style.opacity)).toEqual(before);
    expect(before.every((value) => Number(value) === 1)).toBe(true);
  });

  it('re-lays the bulbs when the count changes', () => {
    const { rerender } = render(<MarqueeBorder bulbCount={4} />);
    expect(bulbs()).toHaveLength(4);

    rerender(<MarqueeBorder bulbCount={7} />);

    expect(bulbs()).toHaveLength(7);
  });

  it('stops the timer on unmount', () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(window, 'clearInterval');
    const { unmount } = render(<MarqueeBorder bulbCount={4} />);

    unmount();

    expect(clear).toHaveBeenCalled();
  });
});
