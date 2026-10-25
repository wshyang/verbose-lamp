import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FRAME_FINISHES,
  createGoldFrameMaterial,
  createGoldFrameUniforms,
  finishForFormula,
  frameMaterialCacheKey,
  type FrameFinish,
} from './frameMaterial';

/**
 * The shader is exercised by calling `onBeforeCompile` with stand-ins for three's own chunk
 * markers: the same injection path the renderer takes, without a GPU.
 */
type Create = (uniforms: ReturnType<typeof createGoldFrameUniforms>) => ReturnType<typeof createGoldFrameMaterial>;

function compile(create: Create) {
  const uniforms = createGoldFrameUniforms();
  const material = create(uniforms);
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

// Recorded against the gold material as delivered, before the brass finish existed. The brass
// work (ADDENDUM-021 §3.6) must leave this program untouched, so any change here is a change
// to every title card and to the printed poster border.
describe('delivered gold program', () => {
  it('is unchanged by the brass finish', () => {
    const { material, shader } = compile((uniforms) => createGoldFrameMaterial(uniforms));

    expect({
      color: material.color.getHexString(),
      emissive: material.emissive.getHexString(),
      metalness: material.metalness,
      roughness: material.roughness,
      envMapIntensity: material.envMapIntensity,
      transparent: material.transparent,
      cacheKey: material.customProgramCacheKey(),
      uniforms: Object.keys(shader.uniforms),
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
    }).toMatchSnapshot();
  });
});

const compileFinish = (finish: FrameFinish) =>
  compile((uniforms) => createGoldFrameMaterial(uniforms, { finish }));

describe('the finish list', () => {
  it('names exactly the two finishes, gold first', () => {
    expect(FRAME_FINISHES).toEqual(['gold', 'brass']);
  });

  it('has a program key and a material for every finish', () => {
    for (const finish of FRAME_FINISHES) {
      expect(frameMaterialCacheKey(finish)).toBeTruthy();
      expect(compileFinish(finish).material.customProgramCacheKey()).toBe(frameMaterialCacheKey(finish));
    }
  });
});

describe('createGoldFrameMaterial finishes', () => {
  it('defaults to gold when no options are given', () => {
    expect(createGoldFrameMaterial(createGoldFrameUniforms()).color.getHexString()).toBe('f4c95d');
  });

  it('keeps the gold finish as the delivered metal', () => {
    const { material } = compileFinish('gold');

    expect(material.color.getHexString()).toBe('f4c95d');
    expect(material.metalness).toBe(0.96);
    expect(material.roughness).toBe(0.17);
    expect(material.transparent).toBe(true);
    expect(material.side).toBe(THREE.DoubleSide);
  });

  it('gives brass the darker, rougher metal', () => {
    const { material } = compileFinish('brass');

    expect(material.color.getHexString()).toBe('ba9c72');
    expect(material.metalness).toBe(0.9);
    expect(material.roughness).toBe(0.32);
    expect(material.envMapIntensity).toBeLessThan(2.35);
  });

  it('declares and forwards the tone attribute for brass only', () => {
    const brass = compileFinish('brass').shader;
    const gold = compileFinish('gold').shader;

    expect(brass.vertexShader).toContain('attribute vec2 aTone;');
    expect(brass.vertexShader).toContain('vToneData = aTone;');
    expect(brass.fragmentShader).toContain('varying vec2 vToneData;');
    for (const source of [gold.vertexShader, gold.fragmentShader]) {
      expect(source).not.toContain('aTone');
      expect(source).not.toContain('vToneData');
    }
  });

  it('binds the four shared uniforms', () => {
    const { shader, uniforms } = compileFinish('gold');

    expect(shader.uniforms.uDraw).toBe(uniforms.uDraw);
    expect(shader.uniforms.uTime).toBe(uniforms.uTime);
    expect(shader.uniforms.uOpacity).toBe(uniforms.uOpacity);
    expect(shader.uniforms.uPartOpen).toBe(uniforms.uPartOpen);
  });

  it('always injects the trim reveal, the sheen and the fade', () => {
    for (const finish of FRAME_FINISHES) {
      const { shader } = compileFinish(finish);
      expect(shader.fragmentShader).toContain('discard');
      expect(shader.fragmentShader).toContain('tipSpark');
      expect(shader.fragmentShader).toContain('gl_FragColor.a *= uOpacity;');
    }
  });

  it('injects the brass tone, grain, banded light and glints only for brass', () => {
    const brass = compileFinish('brass').shader.fragmentShader;
    const gold = compileFinish('gold').shader.fragmentShader;

    for (const marker of ['albedoTone', 'grainCoord', 'bandDir', 'glintGate']) {
      expect(brass).toContain(marker);
      expect(gold).not.toContain(marker);
    }
  });

  it('keeps every include it replaces', () => {
    const { shader } = compileFinish('brass');

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
    expect(compileFinish('gold').material.customProgramCacheKey()).toBe('gatsby-gold-frame-trim-v2');
    expect(compileFinish('brass').material.customProgramCacheKey()).toBe('gatsby-brass-frame-trim-v1');
  });
});

// PR #2's selector: brass applies to a lattice foundation or any enabled lattice layer.
describe('finishForFormula', () => {
  it('is brass for a lattice foundation', () => {
    expect(finishForFormula({ source: 'lattice' })).toBe('brass');
  });

  it('is brass when a lattice layer is enabled over another foundation', () => {
    expect(finishForFormula({ source: 'authored', layers: [{ source: 'lattice', enabled: true }] })).toBe('brass');
  });

  it('is gold when the lattice layer is disabled or another layer is on', () => {
    expect(finishForFormula({ source: 'authored', layers: [{ source: 'lattice', enabled: false }] })).toBe('gold');
    expect(finishForFormula({ source: 'authored', layers: [{ source: 'rosette', enabled: true }] })).toBe('gold');
  });

  it('is gold with no layers at all', () => {
    expect(finishForFormula({ source: 'authored' })).toBe('gold');
  });
});
