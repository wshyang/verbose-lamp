// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { act, render } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type RgbaImage } from '@/shared/lib/raster';

import { ShimmerCanvas } from './ShimmerCanvas';

function frame(id: number): RgbaImage {
  return { width: 2, height: 1, data: new Uint8ClampedArray([id, 0, 0, 255, id, 0, 0, 255]) };
}
const ctx = {
  createImageData: vi.fn((width: number, height: number) => ({
    width, height, data: new Uint8ClampedArray(width * height * 4),
  })),
  putImageData: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('ShimmerCanvas', () => {
  it('plays a ping-pong loop at a custom rate and cleans up', () => {
    vi.useFakeTimers();
    const frames = [frame(1), frame(2), frame(3)];
    const { container, unmount } = render(
      <ShimmerCanvas frames={frames} label="Preview" testId="shimmer" frameMs={50} />
    );
    const canvas = container.querySelector('canvas')!;
    expect([canvas.width, canvas.height]).toEqual([2, 1]);
    expect(ctx.putImageData.mock.calls.map(([image]) => image.data[0])).toEqual([1]);
    act(() => vi.advanceTimersByTime(50));
    act(() => vi.advanceTimersByTime(50));
    act(() => vi.advanceTimersByTime(50));
    act(() => vi.advanceTimersByTime(50));
    expect(ctx.putImageData.mock.calls.map(([image]) => image.data[0])).toEqual([1, 2, 3, 2, 1]);
    unmount();
    act(() => vi.advanceTimersByTime(50));
    expect(ctx.putImageData).toHaveBeenCalledTimes(5);
  });

  it('uses the default frame rate and stays still for one frame', () => {
    vi.useFakeTimers();
    render(<ShimmerCanvas frames={[frame(5)]} label="Still" testId="still" />);
    act(() => vi.advanceTimersByTime(500));
    expect(ctx.putImageData).toHaveBeenCalledOnce();
  });

  it('animates when matchMedia itself is missing', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', undefined);
    render(<ShimmerCanvas frames={[frame(1), frame(2)]} label="Live" testId="live" frameMs={40} />);
    act(() => vi.advanceTimersByTime(40));
    expect(ctx.putImageData).toHaveBeenCalledTimes(2);
  });

  it('handles missing matchMedia and empty/missing canvas contexts', () => {
    vi.stubGlobal('matchMedia', undefined);
    const empty = render(<ShimmerCanvas frames={[]} label="Empty" testId="empty" />);
    expect(ctx.createImageData).not.toHaveBeenCalled();
    empty.unmount();

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<ShimmerCanvas frames={[frame(1)]} label="No context" testId="none" />);
    expect(ctx.putImageData).not.toHaveBeenCalled();
  });
});
