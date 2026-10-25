// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasCalls, installCanvas2d } from '@/test/canvas2d';
import {
  SEARCHLIGHT_TEXTURE_HEIGHT,
  SEARCHLIGHT_TEXTURE_WIDTH,
  createSearchlightTexture,
} from './searchlightTexture';

/**
 * The cone texture is the whole look of the two premiere searchlights, so the test pins
 * the numbers rather than the pixels: the canvas size, the four vertical stops, the
 * horizontal falloff composited over them (ADDENDUM-022 §6 step 2.3).
 */
describe('createSearchlightTexture', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bakes the cone into a 128 × 256 canvas', () => {
    installCanvas2d();
    const texture = createSearchlightTexture();

    expect(texture.image).toBeInstanceOf(HTMLCanvasElement);
    expect((texture.image as HTMLCanvasElement).width).toBe(SEARCHLIGHT_TEXTURE_WIDTH);
    expect((texture.image as HTMLCanvasElement).height).toBe(SEARCHLIGHT_TEXTURE_HEIGHT);
  });

  it('draws the gold gradient top-down and then masks it horizontally', () => {
    installCanvas2d();
    createSearchlightTexture();

    const calls = canvasCalls();
    expect(calls).toContain('createLinearGradient(0,0,0,256)');
    expect(calls).toContain('gradient#1.addColorStop(0,rgba(255, 226, 148, 0.0))');
    expect(calls).toContain('gradient#1.addColorStop(1,rgba(0, 0, 0, 0.0))');
    expect(calls).toContain('globalCompositeOperation=destination-in');
    expect(calls).toContain('createLinearGradient(0,0,128,0)');
    expect(calls.filter((call) => call === 'fillRect(0,0,128,256)')).toHaveLength(2);
  });

  it('still returns a texture when the browser has no 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const texture = createSearchlightTexture();

    expect(texture.image).toBeInstanceOf(HTMLCanvasElement);
  });
});
