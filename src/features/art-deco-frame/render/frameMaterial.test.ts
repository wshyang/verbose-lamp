import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createGoldFrameMaterial,
  createGoldFrameUniforms,
  frameMaterialCacheKey,
  type FrameFinish,
} from './frameMaterial';

/**
 * The shader is exercised by calling `onBeforeCompile` with three's own chunks —
 * the same injection path the renderer takes, without a GPU. This is what makes
 * the WebGL layer testable at all (ADDENDUM-028 §3).
 */
function compile(finish: FrameFinish = 'gold') {
  const uniforms = createGoldFrameUniforms();
  const material = createGoldFrameMaterial(uniforms, { finish });
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: `#include <common>\n#include <begin_vertex>`,
    fragmentShader: [
      '#include <common>',
      '#include <clipping_planes_fragment>',
      '#include <color_fragment>',
      '#include <normal_fragment_maps>',
      '#include <emissivemap_fragment>',
      '#include <opaque_fragment>',
    ].join('\n'),
    defines: {},
  };
  material.onBeforeCompile(shader as unknown as Parameters<typeof material.onBeforeCompile>[0], undefined as never);
  return { material, shader, uniforms };
}

describe('createGoldFrameMaterial', () => {
  it('keeps the gold finish as the delivered metal', () => {
    const { material } = compile('gold');
    expect(material.color.getHexString()).toBe('f4c95d');
    expect(material.metalness).toBe(0.96);
    expect(material.roughness).toBe(0.17);
    expect(material.transparent).toBe(true);
    expect(material.side).toBe(THREE.DoubleSide);
  });

  it('gives brass the darker, rougher metal from the plan', () => {
    const { material } = compile('brass');
    expect(material.color.getHexString()).toBe('ba9c72');
    expect(material.metalness).toBe(0.9);
    expect(material.roughness).toBe(0.32);
    expect(material.envMapIntensity).toBeLessThan(2.35);
  });

  it('binds the four shared uniforms', () => {
    const { shader, uniforms } = compile();
    expect(shader.uniforms.uDraw).toBe(uniforms.uDraw);
    expect(shader.uniforms.uTime).toBe(uniforms.uTime);
    expect(shader.uniforms.uOpacity).toBe(uniforms.uOpacity);
    expect(shader.uniforms.uPartOpen).toBe(uniforms.uPartOpen);
  });

  it('declares the tone attribute and passes it through', () => {
    const { shader } = compile();
    expect(shader.vertexShader).toContain('attribute vec2 aTone;');
    expect(shader.vertexShader).toContain('vToneData = aTone;');
    expect(shader.fragmentShader).toContain('varying vec2 vToneData;');
  });

  it('always injects the trim reveal, the sheen and the fade', () => {
    for (const finish of ['gold', 'brass'] as const) {
      const { shader } = compile(finish);
      expect(shader.fragmentShader).toContain('discard');
      expect(shader.fragmentShader).toContain('tipSpark');
      expect(shader.fragmentShader).toContain('gl_FragColor.a *= uOpacity;');
    }
  });

  it('leaves the gold shader free of brass code', () => {
    const { shader } = compile('gold');
    expect(shader.fragmentShader).not.toContain('brassTone');
    expect(shader.fragmentShader).not.toContain('glintGate');
    expect(shader.fragmentShader).not.toContain('albedoTone');
  });

  it('injects the brass tone, grain, banded light and glints', () => {
    const { shader } = compile('brass');
    expect(shader.fragmentShader).toContain('albedoTone');
    expect(shader.fragmentShader).toContain('grainCoord');
    expect(shader.fragmentShader).toContain('bandDir');
    expect(shader.fragmentShader).toContain('glintGate');
  });

  it('keeps every include it replaces', () => {
    const { shader } = compile('brass');
    for (const chunk of [
      '#include <common>',
      '#include <clipping_planes_fragment>',
      '#include <color_fragment>',
      '#include <normal_fragment_maps>',
      '#include <emissivemap_fragment>',
      '#include <opaque_fragment>',
    ]) {
      expect(shader.fragmentShader).toContain(chunk);
    }
  });

  it('uses a distinct program cache key per finish', () => {
    expect(frameMaterialCacheKey('gold')).not.toBe(frameMaterialCacheKey('brass'));
    const gold = compile('gold').material;
    const brass = compile('brass').material;
    expect(gold.customProgramCacheKey()).toBe('gatsby-gold-frame-trim-v2');
    expect(brass.customProgramCacheKey()).toBe('gatsby-brass-frame-trim-v1');
  });

  it('defaults to gold when no options are given', () => {
    const material = createGoldFrameMaterial(createGoldFrameUniforms());
    expect(material.color.getHexString()).toBe('f4c95d');
  });
});
