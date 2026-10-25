// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createExtrudedDecoTextMesh } from './decoTypography';

describe('createExtrudedDecoTextMesh', () => {
  it('measures a hero word and builds the 3D layers', () => {
    const rig = createExtrudedDecoTextMesh({
      text: 'GATSBY',
      worldHeight: 1.58,
      extrudeDepth: 0.22,
      finish: 'platinum-gold',
      alternatePinstripes: true,
      tracking: 0.16,
      weight: 'hero',
    });

    expect(rig.width).toBeGreaterThan(0);
    expect(rig.height).toBeGreaterThan(0);
    expect(rig.group).toBeInstanceOf(THREE.Group);
    expect(rig.group.children.length).toBeGreaterThan(0);
    rig.dispose();
  });

  it.each(['hero', 'regular', 'fine'] as const)('builds the %s weight', (weight) => {
    const rig = createExtrudedDecoTextMesh({ text: 'THE GREAT', worldHeight: 0.4, weight });
    expect(rig.group.children.length).toBeGreaterThan(0);
    rig.dispose();
  });

  it('handles empty text, punctuation-only text and unknown glyphs', () => {
    const empty = createExtrudedDecoTextMesh({ text: '', worldHeight: 0.3 });
    expect(empty.width).toBeGreaterThan(0);

    const punctuation = createExtrudedDecoTextMesh({ text: '· - .', worldHeight: 0.3 });
    expect(punctuation.group.children.length).toBeGreaterThan(0);

    const unknown = createExtrudedDecoTextMesh({ text: 'GÄT', worldHeight: 0.3 });
    expect(unknown.width).toBeGreaterThan(0);

    empty.dispose();
    punctuation.dispose();
    unknown.dispose();
  });

  it('keeps long text inside the texture width budget', () => {
    const rig = createExtrudedDecoTextMesh({
      text: 'FROM THE NOVEL BY F. SCOTT FITZGERALD',
      worldHeight: 0.23,
      weight: 'fine',
    });
    expect(rig.width).toBeGreaterThan(0);
    rig.dispose();
  });

  it('clamps the reveal and updates the shared uniforms', () => {
    const rig = createExtrudedDecoTextMesh({ text: 'GG', worldHeight: 0.5 });
    const material = (rig.group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>',
    };
    (material.onBeforeCompile as unknown as (s: unknown) => void)(shader);

    rig.setReveal(2, 0.5, 0.4);
    expect(shader.uniforms.uReveal.value).toBe(1);
    expect(shader.uniforms.uShimmer.value).toBe(0.5);
    expect(shader.uniforms.uOpacity.value).toBe(0.4);

    rig.setReveal(-1, 0.1);
    expect(shader.uniforms.uReveal.value).toBe(0);
    expect(shader.uniforms.uOpacity.value).toBe(1);
    rig.dispose();
  });

  it('disposes every mesh it created', () => {
    const rig = createExtrudedDecoTextMesh({ text: 'GG', worldHeight: 0.5 });
    const disposals = rig.group.children.map((child) => {
      const mesh = child as THREE.Mesh;
      return vi.spyOn(mesh.material as THREE.Material, 'dispose');
    });
    rig.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalled();
  });
});

describe('extruded side shells', () => {
  it('injects the reveal shader into the side material too', () => {
    const rig = createExtrudedDecoTextMesh({ text: 'GG', worldHeight: 0.5 });
    const side = rig.group.children.at(-1) as THREE.Mesh;
    const material = side.material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: '#include <common>\n#include <uv_vertex>',
      fragmentShader: '#include <common>\n#include <alphatest_fragment>',
    };
    (material.onBeforeCompile as unknown as (s: unknown) => void)(shader);
    expect(material.customProgramCacheKey()).toBe('gatsby-deco-text-side-v1');
    expect(shader.uniforms.uReveal.value).toBe(1);
    expect(shader.fragmentShader).toContain('uOpacity');
    rig.dispose();
  });

  it('names the front program cache key', () => {
    const rig = createExtrudedDecoTextMesh({ text: 'GG', worldHeight: 0.5 });
    const front = rig.group.children[0] as THREE.Mesh;
    const material = front.material as THREE.MeshStandardMaterial;
    expect(material.customProgramCacheKey()).toBe('gatsby-deco-text-front-v1');
    rig.dispose();
  });
});
