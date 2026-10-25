// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GildedPortraitCanvas } from './GildedPortraitCanvas';

import { type RgbaImage } from './types';

const IMAGE: RgbaImage = { width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]) };
const ctx = {
  createImageData: vi.fn((width: number, height: number) => ({
    width, height, data: new Uint8ClampedArray(width * height * 4),
  })),
  putImageData: vi.fn(),
};
afterEach(() => vi.restoreAllMocks());
describe('GildedPortraitCanvas', () => {
  it('paints image pixels, uses default test id, and shows the sheen', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    const { container } = render(<GildedPortraitCanvas image={IMAGE} label="Gold" isShimmering />);
    const canvas = screen.getByTestId('gilded-portrait__preview') as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([2, 1]);
    expect(ctx.putImageData.mock.calls[0][0].data).toEqual(IMAGE.data);
    expect(container.querySelector('.gilded-portrait-sheen')).toBeTruthy();
  });

  it('accepts a custom test id, hides sheen, and tolerates no context', () => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = render(
      <GildedPortraitCanvas image={IMAGE} label="Plain" isShimmering={false} testId="custom" />
    );
    expect(screen.getByTestId('custom')).toBeTruthy();
    expect(container.querySelector('.gilded-portrait-sheen')).toBeNull();
    expect(ctx.putImageData).not.toHaveBeenCalled();
  });
});
