import * as THREE from 'three';
import type { FrameFinish } from '../engine/frameGrammar/types';

export interface GoldFrameUniforms {
  uDraw: { value: number };
  uPartOpen: { value: number };
  uOpacity: { value: number };
  uTime: { value: number };
}

type FrameShader = Parameters<THREE.Material['onBeforeCompile']>[0];

export function createGoldFrameUniforms(draw = 0, opacity = 1): GoldFrameUniforms {
  return {
    uDraw: { value: draw },
    uPartOpen: { value: 0 },
    uOpacity: { value: opacity },
    uTime: { value: 0 },
  };
}

function bindUniforms(shader: FrameShader, uniforms: GoldFrameUniforms, finish: FrameFinish) {
  shader.uniforms.uDraw = uniforms.uDraw;
  shader.uniforms.uPartOpen = uniforms.uPartOpen;
  shader.uniforms.uOpacity = uniforms.uOpacity;
  shader.uniforms.uTime = uniforms.uTime;
  if (finish === 'brass') {
    shader.uniforms.uBrassDark = { value: new THREE.Color('#775320') };
  }
}

function injectVertexAttributes(shader: FrameShader, finish: FrameFinish) {
  const toneDecl = finish === 'brass' ? '\n     attribute vec2 aTone;\n     varying vec2 vTone;' : '';
  const toneAssign = finish === 'brass' ? '\n     vTone = aTone;' : '';
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
     attribute vec3 aPathData;
     uniform float uPartOpen;
     varying vec3 vPathData;
     varying vec3 vWorldPosDeco;${toneDecl}`
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     vPathData = aPathData;${toneAssign}
     float openEase = uPartOpen * uPartOpen * (3.0 - 2.0 * uPartOpen);
     transformed.x += aPathData.z * openEase * 5.2;
     vec4 wpDeco = modelMatrix * vec4(transformed, 1.0);
     vWorldPosDeco = wpDeco.xyz;`
  );
}

function injectFragmentUniforms(shader: FrameShader, finish: FrameFinish) {
  const brassHeader =
    finish === 'brass'
      ? `
     uniform vec3 uBrassDark;
     varying vec2 vTone;
     float hash12Deco(vec2 p) {
       vec3 p3 = fract(vec3(p.xyx) * 0.1031);
       p3 += dot(p3, p3.yzx + 33.33);
       return fract((p3.x + p3.y) * p3.z);
     }`
      : '';
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
     uniform float uDraw;
     uniform float uOpacity;
     uniform float uTime;
     varying vec3 vPathData;
     varying vec3 vWorldPosDeco;${brassHeader}`
  );
}

function injectTrimReveal(shader: FrameShader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <clipping_planes_fragment>',
    `#include <clipping_planes_fragment>
     float segU = vPathData.x;
     float delay = vPathData.y;
     float localDraw = clamp((uDraw - delay) / max(0.25, 1.0 - delay), 0.0, 1.0);
     localDraw = 1.0 - pow(1.0 - localDraw, 2.4);
     if (segU > localDraw || localDraw <= 0.001 || uOpacity <= 0.01) discard;`
  );
}

/** Per-rail brass gradient (ADDENDUM-021 §3.6): base tone swept along its seeded angle. */
function injectBrassTone(shader: FrameShader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     float toneFlow = dot(vWorldPosDeco.xy, vec2(cos(vTone.y), sin(vTone.y))) * 0.10;
     diffuseColor.rgb = mix(diffuseColor.rgb, uBrassDark, clamp(vTone.x + toneFlow, 0.0, 1.0));`
  );
}

/** Vertical scratch grain: anisotropic hash lines tilting the normal (view-space approximation). */
function injectBrassScratches(shader: FrameShader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
     float scratchHash = hash12Deco(vec2(floor(vWorldPosDeco.x * 170.0), floor(vWorldPosDeco.y * 6.0)));
     float scratchTilt = (scratchHash - 0.5) * 0.30;
     normal = normalize(normal + vec3(scratchTilt, scratchTilt * 0.3, 0.0));`
  );
}

function injectGoldSheen(shader: FrameShader, finish: FrameFinish) {
  const brassRaking =
    finish === 'brass'
      ? `
     float rakeBand = pow(0.5 + 0.5 * sin(diagCoord * 20.0 - uTime * 0.8), 3.0);
     float glintCell = hash12Deco(floor(vWorldPosDeco.xy * vec2(9.0, 13.0)));
     float glint = step(0.985, glintCell) * pow(0.5 + 0.5 * sin(uTime * 2.2 + glintCell * 40.0), 6.0);
     totalEmissiveRadiance += vec3(0.72, 0.58, 0.34) * (rakeBand * 0.10) + vec3(1.0, 0.94, 0.78) * (glint * 0.7);`
      : '';
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
     float localTipDraw = clamp((uDraw - vPathData.y) / max(0.25, 1.0 - vPathData.y), 0.0, 1.0);
     localTipDraw = 1.0 - pow(1.0 - localTipDraw, 2.4);
     float distToTip = max(0.0, localTipDraw - vPathData.x);
     float tipSpark = exp(-distToTip * 26.0) * step(0.01, localTipDraw) * (1.0 - smoothstep(0.94, 1.0, localTipDraw));
     float diagCoord = vWorldPosDeco.x * 0.22 + vWorldPosDeco.y * 0.18;
     float sweepCenter = mod(uTime * 0.55, 4.4) - 2.2;
     float sheen = exp(-pow((diagCoord - sweepCenter) * 3.6, 2.0));
     float brush = sin(vWorldPosDeco.x * 38.0 + vWorldPosDeco.y * 12.0) * 0.04 + 0.96;
     totalEmissiveRadiance *= brush;
     totalEmissiveRadiance += vec3(1.0, 0.88, 0.52) * (tipSpark * 2.2 + sheen * 0.48);${brassRaking}`
  );
}

function injectOpacity(shader: FrameShader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `#include <opaque_fragment>
     gl_FragColor.a *= uOpacity;`
  );
}

/**
 * The chamfered frame material. `finish: 'brass'` (ADDENDUM-021 §3.6) is the
 * tutorial's muted antique look — #ba9c72 albedo blended toward #775320 by
 * per-rail tone, rougher and less mirror-like, with scratch grain, banded
 * raking light and glints. The default gold program is unchanged.
 */
export function createGoldFrameMaterial(
  uniforms: GoldFrameUniforms,
  finish: FrameFinish = 'gold',
): THREE.MeshStandardMaterial {
  const isBrass = finish === 'brass';
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(isBrass ? '#ba9c72' : '#f4c95d'),
    emissive: new THREE.Color('#281802'),
    metalness: isBrass ? 0.9 : 0.96,
    roughness: isBrass ? 0.32 : 0.17,
    envMapIntensity: 2.35,
    transparent: true,
    side: THREE.DoubleSide,
  });
  material.customProgramCacheKey = () =>
    isBrass ? 'gatsby-gold-frame-trim-v2-brass' : 'gatsby-gold-frame-trim-v2';
  material.onBeforeCompile = (shader) => {
    bindUniforms(shader, uniforms, finish);
    injectVertexAttributes(shader, finish);
    injectFragmentUniforms(shader, finish);
    injectTrimReveal(shader);
    if (isBrass) {
      injectBrassTone(shader);
      injectBrassScratches(shader);
    }
    injectGoldSheen(shader, finish);
    injectOpacity(shader);
  };
  return material;
}
