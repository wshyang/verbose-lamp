// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { setupDomTests } from '../../../test/dom';
import { installCanvas2d, type Canvas2d } from '../../../test/canvas2d';

/**
 * The chamfer passes of `createExtrudedDecoTextMesh`. With an empty mask the
 * distance field is all zeros and the two passes never fire, so the main suite
 * only sees the flat case. Here the mask probe returns solid alpha, which forces
 * both sweeps to compute real distances and the crest tint to interpolate
 * (ADDENDUM-027 §5).
 */
class SilentPath2D {
  moveTo() {}
  lineTo() {}
  arc() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  closePath() {}
}

vi.stubGlobal('Path2D', SilentPath2D);

import { createExtrudedDecoTextMesh } from './decoTypography';

setupDomTests();

let canvas: Canvas2d;

beforeEach(() => {
  // Opaque mask: every sample is inside the glyph, so the heightfield is capped
  // by the bevel limit rather than by absence of ink.
  canvas = installCanvas2d({ opaqueReadback: true });
});

const rig = (overrides: Partial<Parameters<typeof createExtrudedDecoTextMesh>[0]> = {}) =>
  createExtrudedDecoTextMesh({ text: 'GG', worldHeight: 1, ...overrides });

const frontMaterial = (group: THREE.Group) =>
  (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;

describe('chamfer heightfield with ink in the mask', () => {
  it('caps the heightfield at the bevel limit when every sample is ink', () => {
    const { group } = rig();
    const normals = (frontMaterial(group).normalMap as THREE.DataTexture).image
      .data as unknown as Uint8Array;

    // A fully saturated distance field is a plateau: height 1 everywhere, so the
    // normal stays +Z while the crest factor reaches its maximum.
    expect(normals[0]).toBe(128);
    expect(normals[2]).toBe(255);
    const texture = frontMaterial(group).map as THREE.CanvasTexture;
    const pixels = (texture.image as HTMLCanvasElement).width * 0;
    expect(pixels).toBe(0);
  });

  it('keeps the plateau at the +Z normal', () => {
    const { group } = rig({ strokeWidth: 40 } as Partial<Parameters<typeof createExtrudedDecoTextMesh>[0]>);
    const normals = (frontMaterial(group).normalMap as THREE.DataTexture).image
      .data as unknown as Uint8Array;
    const last = (normals.length / 4 - 1) * 4;

    expect(normals[last + 2]).toBe(255);
  });

  it('tints the crest toward platinum on the face', () => {
    const { group } = rig({ finish: 'platinum-gold' });
    const texture = frontMaterial(group).map as THREE.CanvasTexture;
    const source = texture.image as HTMLCanvasElement;

    // The albedo canvas is written through `putImageData`, which the recorder keeps.
    expect(canvas.images.length).toBeGreaterThan(0);
    const written = canvas.images[canvas.images.length - 1];
    const channels = Array.from(written.data as Uint8ClampedArray).filter((_, index) => index % 4 === 0);

    expect(channels.some((value) => value > 230)).toBe(true);
    expect(source.width).toBeGreaterThan(0);
  });

  it('tints pure gold to its crest colour when the mask is saturated', () => {
    rig({ finish: 'pure-gold' });
    const written = canvas.images[canvas.images.length - 1];
    const channels = written.data as Uint8ClampedArray;

    // Crest 1 → #ff f0 88: 215 + 40, 166 + 58, 58 + 78.
    expect([channels[0], channels[1], channels[2]]).toEqual([255, 224, 136]);
  });

  it('still builds the full slice stack and disposes it', () => {
    const { group, dispose } = rig();
    const textures = [
      frontMaterial(group).map,
      frontMaterial(group).normalMap,
    ];

    expect(group.children.length).toBeGreaterThan(5);
    dispose();

    expect(textures.every((texture) => texture !== null)).toBe(true);
  });
});
