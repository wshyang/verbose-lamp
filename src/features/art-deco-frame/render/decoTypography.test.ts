// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { stableDigest } from '@/test/digest';
import { createExtrudedDecoTextMesh } from './decoTypography';
import type { DecoTextOptions } from '../model/decoText';

/**
 * The carved type rig, pinned before it was split (ADDENDUM-032). This is a pure
 * code-motion guard: every number below is a property of the *result*, so a
 * refactor that changes any of them is a behaviour change, not tidying.
 *
 * Pixels are not asserted — jsdom's canvas stub records calls rather than
 * rasterising. What is asserted is the structure the renderer consumes: plane
 * size, slice stack, material response and the reveal uniform plumbing.
 */

const HERO: DecoTextOptions = { text: 'GATSBY', worldHeight: 1.58, extrudeDepth: 0.22, tracking: 0.16 };
const PLAIN: DecoTextOptions = {
  text: 'THE GREAT',
  worldHeight: 0.88,
  finish: 'pure-gold',
  alternatePinstripes: false,
  weight: 'fine',
};

function describeRig(options: DecoTextOptions) {
  const rig = createExtrudedDecoTextMesh(options);
  const [front, ...slices] = rig.group.children as THREE.Mesh[];
  const frontMat = front.material as THREE.MeshStandardMaterial;
  const sideMat = slices[0].material as THREE.MeshStandardMaterial;
  const plane = front.geometry as THREE.PlaneGeometry;

  const shaderOf = (material: THREE.MeshStandardMaterial) => {
    const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: '', fragmentShader: '' };
    material.onBeforeCompile(shader as never, null as never);
    return shader;
  };
  const frontShader = shaderOf(frontMat);
  rig.setReveal(0.42, 1.5, 0.8);

  return {
    width: rig.width,
    height: rig.height,
    slices: slices.length,
    plane: { width: plane.parameters.width, height: plane.parameters.height },
    sliceZ: slices.map((slice) => slice.position.z),
    sliceScale: slices.map((slice) => slice.scale.x),
    front: {
      metalness: frontMat.metalness,
      roughness: frontMat.roughness,
      alphaTest: frontMat.alphaTest,
      normalScale: frontMat.normalScale.x,
      envMapIntensity: frontMat.envMapIntensity,
      key: frontMat.customProgramCacheKey(),
      mapSize: [(frontMat.map as THREE.CanvasTexture).image.width, (frontMat.map as THREE.CanvasTexture).image.height],
      normalSize: [
        (frontMat.normalMap as THREE.DataTexture).image.width,
        (frontMat.normalMap as THREE.DataTexture).image.height,
      ],
    },
    side: {
      metalness: sideMat.metalness,
      roughness: sideMat.roughness,
      alphaTest: sideMat.alphaTest,
      normalScale: sideMat.normalScale.x,
      color: sideMat.color.getHexString(),
      emissive: sideMat.emissive.getHexString(),
      key: sideMat.customProgramCacheKey(),
    },
    reveal: {
      reveal: frontShader.uniforms.uReveal.value,
      shimmer: frontShader.uniforms.uShimmer.value,
      opacity: frontShader.uniforms.uOpacity.value,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createExtrudedDecoTextMesh', () => {
  it('produces the same rig for the hero face as before the split', () => {
    const described = describeRig(HERO);
    expect(described.slices).toBe(11);
    expect(described.reveal).toEqual({ reveal: 0.42, shimmer: 1.5, opacity: 0.8 });
    // The golden digest covers every number the renderer reads back.
    expect(stableDigest(described)).toMatchInlineSnapshot(`
      {
        "hash": "5b0b57cd6bb54dee96c85fd3a9175eedf00d49cd",
        "length": 656,
      }
    `);
  });

  it('produces the same rig for plain gold fine-weight type', () => {
    const described = describeRig(PLAIN);
    expect(described.front.roughness).toBe(0.18);
    expect(stableDigest(described)).toMatchInlineSnapshot(`
      {
        "hash": "b32e7c59faf245cae4ba89713fe9dc61cd258039",
        "length": 678,
      }
    `);
  });

  it('clamps the reveal, shimmer phase and opacity it is handed', () => {
    const rig = createExtrudedDecoTextMesh(HERO);
    const material = (rig.group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: '', fragmentShader: '' };
    material.onBeforeCompile(shader as never, null as never);

    rig.setReveal(-4, 7, 3);
    expect(shader.uniforms.uReveal.value).toBe(0);
    expect(shader.uniforms.uShimmer.value).toBe(7);
    expect(shader.uniforms.uOpacity.value).toBe(1);
  });

  it('disposes the plane, both materials and both textures exactly once', () => {
    const rig = createExtrudedDecoTextMesh(HERO);
    const front = rig.group.children[0] as THREE.Mesh;
    const material = front.material as THREE.MeshStandardMaterial;
    const geometry = vi.spyOn(front.geometry as THREE.PlaneGeometry, 'dispose');
    const map = vi.spyOn(material.map as THREE.Texture, 'dispose');
    const normalMap = vi.spyOn(material.normalMap as THREE.Texture, 'dispose');
    const frontDispose = vi.spyOn(material, 'dispose');
    const sideDispose = vi.spyOn(
      (rig.group.children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial,
      'dispose'
    );

    rig.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(map).toHaveBeenCalledTimes(1);
    expect(normalMap).toHaveBeenCalledTimes(1);
    expect(frontDispose).toHaveBeenCalledTimes(1);
    expect(sideDispose).toHaveBeenCalledTimes(1);
  });

  it('falls back to the O skeleton for a character the alphabet lacks', () => {
    const unknown = describeRig({ text: '\u20ac', worldHeight: 1 });
    const letter = describeRig({ text: 'O', worldHeight: 1 });
    expect(unknown.plane.width).toBe(letter.plane.width);
    expect(unknown.height).toBe(letter.height);
  });

  it('advances a space without drawing a glyph', () => {
    const spaced = describeRig({ text: 'A B', worldHeight: 1 });
    const tight = describeRig({ text: 'AB', worldHeight: 1 });
    // A space costs 0.36 of the cap height and adds no glyph to the canvas width.
    expect(spaced.width).toBeGreaterThan(tight.width);
  });
});
