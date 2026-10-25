// @vitest-environment jsdom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSearchlightTexture } from './searchlightTexture';

describe('createSearchlightTexture', () => {
  it('paints the beam gradient onto a 128×256 canvas texture', () => {
    const texture = createSearchlightTexture();
    expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    const image = texture.image as HTMLCanvasElement;
    expect(image.width).toBe(128);
    expect(image.height).toBe(256);
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  });
});
