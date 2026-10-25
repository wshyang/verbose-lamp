// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { canvasSourceOf } from './locateFace';

const PHOTO = { width: 4, height: 3, data: new Uint8ClampedArray(4 * 3 * 4) };

describe('canvasSourceOf in a browser', () => {
  it('paints the pixels onto a canvas sized to the photo', () => {
    const source = canvasSourceOf(PHOTO) as HTMLCanvasElement;
    expect(source).toBeInstanceOf(HTMLCanvasElement);
    expect(source.width).toBe(4);
    expect(source.height).toBe(3);
  });

  it('returns null when the browser offers no 2D context', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(null);
    expect(canvasSourceOf(PHOTO)).toBeNull();
    getContext.mockRestore();
  });
});
