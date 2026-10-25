import * as THREE from 'three';

/** Reveal, shimmer and fade, shared by the front face and every extruded shell. */
export interface RevealUniforms {
  uReveal: { value: number };
  uShimmer: { value: number };
  uOpacity: { value: number };
}

export function createRevealUniforms(): RevealUniforms {
  return { uReveal: { value: 1.0 }, uShimmer: { value: 0.0 }, uOpacity: { value: 1.0 } };
}

const CURTAIN_REVEAL = `#include <alphatest_fragment>
         // Center-out symmetrical Art Deco curtain reveal
         float distFromCenter = abs(vDecoUv.x - 0.5) * 2.0;
         float edgeMask = smoothstep(uReveal * 1.18, max(0.0, uReveal * 1.18 - 0.16), distFromCenter);
         if (edgeMask <= 0.01 || uOpacity <= 0.01) discard;
         diffuseColor.a *= edgeMask * uOpacity;
        `;

const FRONT_GLINT = `#include <emissivemap_fragment>
           // Travelling diagonal anamorphic light glint + reveal edge spark
           float diag = vDecoUv.x * 0.85 + vDecoUv.y * 0.35;
           float sheenPos = fract(uShimmer * 0.25) * 1.8 - 0.3;
           float glint = exp(-pow((diag - sheenPos) * 9.5, 2.0));
           float distFromCenter2 = abs(vDecoUv.x - 0.5) * 2.0;
           float tipGlow = exp(-pow((distFromCenter2 - uReveal * 1.05) * 12.0, 2.0)) * step(0.02, uReveal) * step(uReveal, 0.96);
           totalEmissiveRadiance += vec3(1.0, 0.86, 0.52) * (glint * 0.65 + tipGlow * 1.35);
          `;

/** Adds the centre-out curtain reveal, and on the front face the travelling glint and tip spark. */
export function injectTextRevealShader(
  material: THREE.MeshStandardMaterial,
  uniforms: RevealUniforms,
  isFront: boolean
): void {
  material.customProgramCacheKey = () => (isFront ? 'gatsby-deco-text-front-v1' : 'gatsby-deco-text-side-v1');
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = uniforms.uReveal;
    shader.uniforms.uShimmer = uniforms.uShimmer;
    shader.uniforms.uOpacity = uniforms.uOpacity;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
         varying vec2 vDecoUv;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
         vDecoUv = uv;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
         uniform float uReveal;
         uniform float uShimmer;
         uniform float uOpacity;
         varying vec2 vDecoUv;`
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', CURTAIN_REVEAL);
    if (isFront) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', FRONT_GLINT);
    }
  };
}
