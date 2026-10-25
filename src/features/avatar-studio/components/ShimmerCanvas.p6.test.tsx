// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { act, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type RgbaImage } from '@/shared/lib/raster';

import { ShimmerCanvas } from './ShimmerCanvas';

import { setupDomTests } from '@/test/dom';

import { installCanvas2d, type Canvas2d } from '@/test/canvas2d';

setupDomTests();
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
const frame_p6 = (value: number): RgbaImage => ({
  width: 2,
  height: 2,
  data: new Uint8ClampedArray(2 * 2 * 4).fill(value),
});
let canvas: Canvas2d;
beforeEach(() => {
  canvas = installCanvas2d();
  stubMedia(false);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});
const puts = () => canvas.calls.filter((call) => call.startsWith('putImageData(')).length;
describe('ShimmerCanvas', () => {
  it('is a labelled image showing the first frame', () => {
    const frames = [frame_p6(10), frame_p6(20)];
    const { container } = render(
      <ShimmerCanvas frames={frames} label="Gilded avatar preview" testId="preview-canvas" />
    );

    const element = screen.getByTestId('preview-canvas') as HTMLCanvasElement;
    expect(element.getAttribute('role')).toBe('img');
    expect(element.getAttribute('aria-label')).toBe('Gilded avatar preview');
    expect(element.width).toBe(2);
    expect(element.height).toBe(2);
    expect(container.querySelector('canvas')).toBe(element);
    expect(puts()).toBe(1);
  });

  it('ping-pongs through the frames', () => {
    render(<ShimmerCanvas frames={[frame_p6(10), frame_p6(20), frame_p6(30)]} label="p" testId="c" frameMs={50} />);
    expect(puts()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(puts()).toBe(2);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(puts()).toBe(3);

    // Reaching the end turns around: cycle = 3 * 2 - 2 = 4 ticks.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(puts()).toBe(5);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(puts()).toBe(6);
  });

  it('draws a single frame and stops', () => {
    render(<ShimmerCanvas frames={[frame_p6(4)]} label="p" testId="c" />);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(puts()).toBe(1);
  });

  it('does nothing when there is nothing to show', () => {
    render(<ShimmerCanvas frames={[]} label="p" testId="c" />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(puts()).toBe(0);
  });

  it('clears the timer on unmount', () => {
    const clear = vi.spyOn(window, 'clearInterval');
    const { unmount } = render(
      <ShimmerCanvas frames={[frame_p6(1), frame_p6(2)]} label="p" testId="c" />
    );

    unmount();

    expect(clear).toHaveBeenCalled();
  });
});
