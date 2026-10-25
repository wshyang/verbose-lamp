import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRevealUniforms, injectTextRevealShader } from './revealMaterial';

/**
 * The reveal shader is injected text, so the only way to check it without a GPU is to run the
 * material's own `onBeforeCompile` over stand-ins for three's chunk markers and read the result,
 * as the frame material tests do. That proves what is spliced where and what is bound; it does not
 * prove the shader compiles or looks right, which needs a real GL context.
 */
function compile(isFront: boolean) {
  const uniforms = createRevealUniforms();
  const material = new THREE.MeshStandardMaterial();
  injectTextRevealShader(material, uniforms, isFront);
  const shader = {
    uniforms: {} as Record<string, { value: number }>,
    vertexShader: '#include <common>\n#include <uv_vertex>',
    fragmentShader: ['#include <common>', '#include <alphatest_fragment>', '#include <emissivemap_fragment>'].join('\n'),
  };
  material.onBeforeCompile(shader as never, null as never);
  return { material, shader, uniforms };
}

describe('createRevealUniforms', () => {
  it('starts fully revealed, unshimmered and opaque', () => {
    expect(createRevealUniforms()).toEqual({
      uReveal: { value: 1 },
      uShimmer: { value: 0 },
      uOpacity: { value: 1 },
    });
  });

  it('hands out fresh objects each time, so two rigs never share a reveal', () => {
    const a = createRevealUniforms();
    const b = createRevealUniforms();
    a.uReveal.value = 0.2;

    expect(b.uReveal.value).toBe(1);
  });
});

describe('injectTextRevealShader', () => {
  it('gives the front and side shells separate program cache keys', () => {
    expect(compile(true).material.customProgramCacheKey()).toBe('gatsby-deco-text-front-v1');
    expect(compile(false).material.customProgramCacheKey()).toBe('gatsby-deco-text-side-v1');
  });

  it('binds the one set of uniforms by reference, so a single write drives every shell', () => {
    const { shader, uniforms } = compile(true);

    expect(shader.uniforms.uReveal).toBe(uniforms.uReveal);
    expect(shader.uniforms.uShimmer).toBe(uniforms.uShimmer);
    expect(shader.uniforms.uOpacity).toBe(uniforms.uOpacity);
  });

  it('passes the uv through the vertex stage and declares what the fragment stage reads', () => {
    const { shader } = compile(false);

    expect(shader.vertexShader).toContain('varying vec2 vDecoUv;');
    expect(shader.vertexShader).toContain('vDecoUv = uv;');
    for (const declaration of ['uniform float uReveal;', 'uniform float uShimmer;', 'uniform float uOpacity;', 'varying vec2 vDecoUv;']) {
      expect(shader.fragmentShader).toContain(declaration);
    }
  });

  it('cuts the centre-out curtain after the alpha test on every shell', () => {
    for (const isFront of [true, false]) {
      const { shader } = compile(isFront);
      const fragment = shader.fragmentShader;

      expect(fragment).toContain('#include <alphatest_fragment>');
      expect(fragment.indexOf('#include <alphatest_fragment>')).toBeLessThan(fragment.indexOf('edgeMask'));
      expect(fragment).toContain('discard');
      expect(fragment).toContain('diffuseColor.a *= edgeMask * uOpacity;');
    }
  });

  // Only the face catches the light: the extruded shells behind it must not glint.
  it('adds the travelling glint and the tip spark to the front face only', () => {
    const front = compile(true).shader.fragmentShader;
    const side = compile(false).shader.fragmentShader;

    for (const marker of ['glint', 'tipGlow', 'sheenPos']) {
      expect(front).toContain(marker);
      expect(side).not.toContain(marker);
    }
    expect(front.indexOf('#include <emissivemap_fragment>')).toBeLessThan(front.indexOf('totalEmissiveRadiance'));
  });

  it('keeps every include it extends', () => {
    const { shader } = compile(true);

    for (const chunk of ['#include <common>', '#include <uv_vertex>', '#include <alphatest_fragment>', '#include <emissivemap_fragment>']) {
      expect(shader.vertexShader + shader.fragmentShader).toContain(chunk);
    }
  });

  // The curtain's edge is `uReveal * 1.18`, which is wider than the unit half-width so a fully
  // revealed word (uReveal 1) clears the outermost column. The expression is the contract.
  it('sizes the curtain edge from the reveal, with the overshoot that fully clears the word', () => {
    const { shader } = compile(true);

    expect(shader.fragmentShader).toContain('smoothstep(uReveal * 1.18, max(0.0, uReveal * 1.18 - 0.16), distFromCenter)');
  });
});
