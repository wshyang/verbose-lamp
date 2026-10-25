// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).

import { describe, expect, it } from 'vitest';
import { createGoldFrameMaterial, createGoldFrameUniforms, frameMaterialCacheKey, type FrameFinish } from './frameMaterial';

/**
 * The shader is exercised by calling `onBeforeCompile` with three's own chunks —
 * the same injection path the renderer takes, without a GPU. This is what makes
 * the WebGL layer testable at all (ADDENDUM-028 §3).
 */
function compile_p6(finish: FrameFinish = 'gold') {
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
  it('leaves the gold shader free of brass code', () => {
    const { shader } = compile_p6('gold');
    expect(shader.fragmentShader).not.toContain('brassTone');
    expect(shader.fragmentShader).not.toContain('glintGate');
    expect(shader.fragmentShader).not.toContain('albedoTone');
  });

  it('injects the brass tone, grain, banded light and glints', () => {
    const { shader } = compile_p6('brass');
    expect(shader.fragmentShader).toContain('albedoTone');
    expect(shader.fragmentShader).toContain('grainCoord');
    expect(shader.fragmentShader).toContain('bandDir');
    expect(shader.fragmentShader).toContain('glintGate');
  });

  it('uses a distinct program cache key per finish', () => {
    expect(frameMaterialCacheKey('gold')).not.toBe(frameMaterialCacheKey('brass'));
    const gold = compile_p6('gold').material;
    const brass = compile_p6('brass').material;
    expect(gold.customProgramCacheKey()).toBe('gatsby-gold-frame-trim-v2');
    expect(brass.customProgramCacheKey()).toBe('gatsby-brass-frame-trim-v1');
  });
});
