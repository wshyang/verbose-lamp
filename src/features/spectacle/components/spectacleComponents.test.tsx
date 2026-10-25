// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarqueeBorder } from './MarqueeBorder';
import { SpectacleLayer } from './SpectacleLayer';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@/shared/hooks/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }));

beforeEach(() => { motion.reduced = false; });
afterEach(() => vi.useRealTimers());

describe('SpectacleLayer', () => {
  it('renders children in the default host with a polite live region', () => {
    const hostRef = createRef<HTMLDivElement>();
    render(
      <SpectacleLayer hostRef={hostRef} announcement="Ready">
        <main>Show</main>
      </SpectacleLayer>
    );
    expect(hostRef.current).toBe(screen.getByTestId('spectacle-layer__host'));
    expect(hostRef.current?.className).toContain('min-h-screen');
    expect(screen.getByRole('status').textContent).toBe('Ready');
    expect(screen.getByText('Show')).toBeTruthy();
  });

  it('accepts a host class override', () => {
    render(
      <SpectacleLayer hostRef={createRef()} announcement="" className="h-full">
        <span>Child</span>
      </SpectacleLayer>
    );
    expect(screen.getByTestId('spectacle-layer__host').className).toBe('h-full');
  });
});

describe('MarqueeBorder', () => {
  it('places bulbs around all four edges and advances chase frames', () => {
    vi.useFakeTimers();
    const { unmount } = render(<MarqueeBorder bulbCount={8} mode="alternate" className="gold" />);
    const bulbs = screen.getAllByTestId('marquee-border__bulb');
    expect(bulbs).toHaveLength(8);
    expect(bulbs.map((bulb) => [bulb.style.left, bulb.style.top])).toEqual([
      ['0%', '0%'], ['50%', '0%'], ['100%', '0%'], ['100%', '50%'],
      ['100%', '100%'], ['50%', '100%'], ['0%', '100%'], ['0%', '50%'],
    ]);
    expect(bulbs[0].style.opacity).toBe('1');
    act(() => vi.advanceTimersByTime(140));
    expect(screen.getAllByTestId('marquee-border__bulb')[0].style.opacity).toBe('0.493');
    unmount();
    act(() => vi.advanceTimersByTime(140));
  });

  it('uses defaults and stays fully lit without timers under reduced motion', () => {
    motion.reduced = true;
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    render(<MarqueeBorder />);
    const bulbs = screen.getAllByTestId('marquee-border__bulb');
    expect(bulbs).toHaveLength(56);
    expect(bulbs.every((bulb) => bulb.style.opacity === '1')).toBe(true);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
