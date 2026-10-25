// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { installCanvas2d } from '@/test/canvas2d';
import { createExtrudedDecoTextMesh } from './decoTypography';
import { setupDomTests } from '../../../test/dom';

/**
 * The chamfer passes of `createExtrudedDecoTextMesh`. With an empty mask the
 * distance field is all zeros and the two passes never fire, so the main suite
 * only sees the flat case. Here the mask probe returns solid alpha, which forces
 * both sweeps to compute real distances and the crest tint to interpolate
 * (ADDENDUM-027 §5).
 */
class SilentPath2D_p6 {
  moveTo() {}
  lineTo() {}
  arc() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  closePath() {}
}
vi.stubGlobal('Path2D', SilentPath2D_p6);
setupDomTests();
beforeEach(() => {
  // Opaque mask: every sample is inside the glyph, so the heightfield is capped
  // by the bevel limit rather than by absence of ink.
  installCanvas2d({ opaqueReadback: true });
});
const rig_p6 = (overrides: Partial<Parameters<typeof createExtrudedDecoTextMesh>[0]> = {}) =>
  createExtrudedDecoTextMesh({ text: 'GG', worldHeight: 1, ...overrides });
const frontMaterial_p6 = (group: THREE.Group) =>
  (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
describe('chamfer heightfield with ink in the mask', () => {
  it('caps the heightfield at the bevel limit when every sample is ink', () => {
    const { group } = rig_p6();
    const normals = (frontMaterial_p6(group).normalMap as THREE.DataTexture).image
      .data as unknown as Uint8Array;

    // A fully saturated distance field is a plateau: height 1 everywhere, so the
    // normal stays +Z while the crest factor reaches its maximum.
    expect(normals[0]).toBe(128);
    expect(normals[2]).toBe(255);
    const texture = frontMaterial_p6(group).map as THREE.CanvasTexture;
    const pixels = (texture.image as HTMLCanvasElement).width * 0;
    expect(pixels).toBe(0);
  });
});
