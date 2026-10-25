// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSearchlightTexture } from './searchlightTexture';

describe('createSearchlightTexture', () => {
  it('paints a 128×256 cone with a soft horizontal falloff', () => {
    const texture = createSearchlightTexture();
    const canvas = texture.image as HTMLCanvasElement;
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(256);

    const context = canvas.getContext('2d') as unknown as {
      createLinearGradient: { mock: { calls: unknown[][] } };
      fillRect: { mock: { calls: unknown[][] } };
      set globalCompositeOperation(value: string);
      get globalCompositeOperation(): string;
    };

    // One vertical gradient and one horizontal mask, each filled over the whole canvas.
    expect(context.createLinearGradient.mock.calls).toEqual([
      [0, 0, 0, 256],
      [0, 0, 128, 0],
    ]);
    expect(context.fillRect.mock.calls).toEqual([
      [0, 0, 128, 256],
      [0, 0, 128, 256],
    ]);
    expect(context.globalCompositeOperation).toBe('destination-in');

    texture.dispose();
  });
});
