// @vitest-environment jsdom
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createExtrudedDecoTextMesh } from './decoTypography';

function context() {
  return {
    lineCap: '', lineJoin: '', miterLimit: 0, globalCompositeOperation: '', strokeStyle: '', lineWidth: 0,
    clearRect: vi.fn(), save: vi.fn(), translate: vi.fn(), scale: vi.fn(), stroke: vi.fn(),
    restore: vi.fn(), drawImage: vi.fn(), putImageData: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        data[pixel * 4 + 3] = pixel % 3 === 0 ? 0 : 255;
      }
      return { data, width, height };
    }),
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4), width, height,
    })),
  };
}

class FakePath2D {
  moveTo = vi.fn();
  lineTo = vi.fn();
  arc = vi.fn();
  closePath = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('Path2D', FakePath2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context() as never);
});

afterAll(() => vi.restoreAllMocks());

describe('createExtrudedDecoTextMesh', () => {
  it('builds default hero platinum text with punctuation, spaces, fallback glyphs, and shaders', () => {
    const rig = createExtrudedDecoTextMesh({ text: "ai1.?·-' z", worldHeight: 2 });
    expect(rig.group.children).toHaveLength(12);
    expect(rig.width).toBeGreaterThan(rig.height);
    expect(rig.group.children[1].position.z).toBeLessThan(0);
    expect(rig.group.children[11].scale.x).toBeGreaterThan(1);

    const [frontMesh, sideMesh] = rig.group.children as THREE.Mesh[];
    const front = frontMesh.material as THREE.MeshStandardMaterial;
    const side = sideMesh.material as THREE.MeshStandardMaterial;
    expect(front.customProgramCacheKey()).toBe('gatsby-deco-text-front-v1');
    expect(side.customProgramCacheKey()).toBe('gatsby-deco-text-side-v1');
    for (const material of [front, side]) {
      const shader = {
        uniforms: {} as Record<string, unknown>,
        vertexShader: '#include <common>\n#include <uv_vertex>',
        fragmentShader: '#include <common>\n#include <alphatest_fragment>\n#include <emissivemap_fragment>',
      };
      material.onBeforeCompile(shader as never, null as never);
      expect(shader.vertexShader).toContain('vDecoUv = uv');
      expect(shader.fragmentShader).toContain('uReveal');
      expect(shader.uniforms.uReveal).toEqual({ value: 1 });
    }

    rig.setReveal(-1, 0.25);
    rig.setReveal(2, 0.5, -1);
    const geometryDispose = vi.spyOn(frontMesh.geometry, 'dispose');
    const frontDispose = vi.spyOn(front, 'dispose');
    const sideDispose = vi.spyOn(side, 'dispose');
    const colorDispose = vi.spyOn(front.map!, 'dispose');
    const normalDispose = vi.spyOn(front.normalMap!, 'dispose');
    rig.dispose();
    expect([geometryDispose, frontDispose, sideDispose, colorDispose, normalDispose]
      .every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });

  it('supports pure gold, regular explicit tracking/depth, and no pinstripe alternation', () => {
    const rig = createExtrudedDecoTextMesh({
      text: 'A', worldHeight: 1, finish: 'pure-gold', weight: 'regular',
      tracking: 0.1, extrudeDepth: 0.5, alternatePinstripes: false,
    });
    expect((rig.group.children[0] as THREE.Mesh).material)
      .toMatchObject({ roughness: 0.18 });
    expect(rig.group.children[11].position.z).toBeCloseTo(-0.5);
    rig.dispose();
  });

  it('supports fine default tracking and an empty fallback word', () => {
    const fine = createExtrudedDecoTextMesh({ text: 'B', worldHeight: 1, weight: 'fine' });
    expect(fine.group.children).toHaveLength(12);
    fine.dispose();
    const empty = createExtrudedDecoTextMesh({ text: '', worldHeight: 1 });
    expect(empty.width).toBeGreaterThan(0);
    empty.dispose();
  });

  it('scales a very long phrase into the maximum canvas', () => {
    const rig = createExtrudedDecoTextMesh({ text: 'W'.repeat(30), worldHeight: 1 });
    const front = (rig.group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect((front.map?.image as HTMLCanvasElement).width).toBe(2560);
    rig.dispose();
  });
});
