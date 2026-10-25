// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGoldFrameMaterial, createGoldFrameUniforms } from './frameMaterial';

const VERTEX_SOURCE = '#include <common>\nvoid main() {\n#include <begin_vertex>\n}';
const FRAGMENT_SOURCE = [
  '#include <common>',
  'void main() {',
  '#include <clipping_planes_fragment>',
  '#include <emissivemap_fragment>',
  '#include <opaque_fragment>',
  '}',
].join('\n');
describe('gold frame material', () => {
  it('starts with the draw hidden and opacity applied', () => {
    const defaults = createGoldFrameUniforms();
    expect(defaults.uDraw.value).toBe(0);
    expect(defaults.uPartOpen.value).toBe(0);
    expect(defaults.uOpacity.value).toBe(1);
    expect(defaults.uTime.value).toBe(0);

    const screenBorder = createGoldFrameUniforms(1, 0.5);
    expect(screenBorder.uDraw.value).toBe(1);
    expect(screenBorder.uOpacity.value).toBe(0.5);
  });

  it('describes a metallic, double-sided gold surface with a stable cache key', () => {
    const material = createGoldFrameMaterial(createGoldFrameUniforms());
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.metalness).toBeCloseTo(0.96);
    expect(material.roughness).toBeCloseTo(0.17);
    expect(material.transparent).toBe(true);
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.customProgramCacheKey?.()).toBe('gatsby-gold-frame-trim-v2');
    material.dispose();
  });

  it('injects the trim, sheen and opacity shader chunks with live uniforms', () => {
    const uniforms = createGoldFrameUniforms();
    const material = createGoldFrameMaterial(uniforms);
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: VERTEX_SOURCE,
      fragmentShader: FRAGMENT_SOURCE,
    };

    material.onBeforeCompile(shader as never, null as never);

    expect(shader.uniforms.uDraw).toBe(uniforms.uDraw);
    expect(shader.uniforms.uPartOpen).toBe(uniforms.uPartOpen);
    expect(shader.uniforms.uOpacity).toBe(uniforms.uOpacity);
    expect(shader.uniforms.uTime).toBe(uniforms.uTime);
    expect(shader.vertexShader).toContain('attribute vec3 aPathData;');
    expect(shader.vertexShader).toContain('vPathData = aPathData;');
    expect(shader.fragmentShader).toContain('uniform float uDraw;');
    expect(shader.fragmentShader).toContain('if (segU > localDraw');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += vec3(1.0, 0.88, 0.52)');
    expect(shader.fragmentShader).toContain('gl_FragColor.a *= uOpacity;');
    material.dispose();
  });
});
