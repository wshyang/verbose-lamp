import * as THREE from 'three';

export type FrameFinish = 'gold' | 'brass';

export interface GoldFrameUniforms {
  uDraw: { value: number };
  uPartOpen: { value: number };
  uOpacity: { value: number };
  uTime: { value: number };
}

export interface GoldFrameMaterialOptions {
  /**
   * `'gold'` (default) is the delivered 24k trim and is byte-for-byte the
   * material shipped before ADDENDUM-021 §3.6. `'brass'` is the Deco Lattice
   * finish: darker albedo, per-rail tone from `aTone`, hammered grain, a banded
   * raking light and sparse glints.
   */
  finish?: FrameFinish;
}

type FrameShader = Parameters<THREE.Material['onBeforeCompile']>[0];

export const FRAME_FINISHES: readonly FrameFinish[] = ['gold', 'brass'] as const;

export function createGoldFrameUniforms(draw = 0, opacity = 1): GoldFrameUniforms {
  return {
    uDraw: { value: draw },
    uPartOpen: { value: 0 },
    uOpacity: { value: opacity },
    uTime: { value: 0 },
  };
}

function bindUniforms(shader: FrameShader, uniforms: GoldFrameUniforms) {
  shader.uniforms.uDraw = uniforms.uDraw;
  shader.uniforms.uPartOpen = uniforms.uPartOpen;
  shader.uniforms.uOpacity = uniforms.uOpacity;
  shader.uniforms.uTime = uniforms.uTime;
}

function injectVertexAttributes(shader: FrameShader) {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
     attribute vec3 aPathData;
     attribute vec2 aTone;
     uniform float uPartOpen;
     varying vec3 vPathData;
     varying vec2 vToneData;
     varying vec3 vWorldPosDeco;`
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     vPathData = aPathData;
     vToneData = aTone;
     float openEase = uPartOpen * uPartOpen * (3.0 - 2.0 * uPartOpen);
     transformed.x += aPathData.z * openEase * 5.2;
     vec4 wpDeco = modelMatrix * vec4(transformed, 1.0);
     vWorldPosDeco = wpDeco.xyz;`
  );
}

function injectFragmentUniforms(shader: FrameShader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
     uniform float uDraw;
     uniform float uOpacity;
     uniform float uTime;
     varying vec3 vPathData;
     varying vec2 vToneData;
     varying vec3 vWorldPosDeco;`
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

function injectGoldSheen(shader: FrameShader) {
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
     totalEmissiveRadiance += vec3(1.0, 0.88, 0.52) * (tipSpark * 2.2 + sheen * 0.48);`
  );
}

/**
 * Brass finish (ADDENDUM-021 §3.6): the dark tone is mixed by the rail's own
 * `aTone`, a stretched hash perturbs the normal as hammered grain, a three-stop
 * band sweeps with `uTime` as the raking light, and sparse hash-gated glints sit
 * on the crest. Kept in one injection so the gold path stays untouched.
 */
function injectBrass(shader: FrameShader) {
  // Albedo first: the per-rail tone is what makes a bundle read as one piece of
  // brushed metal rather than forty separate sticks.
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     float albedoTone = clamp(vToneData.x, 0.0, 1.0);
     diffuseColor.rgb *= mix(vec3(0.62, 0.44, 0.18), vec3(1.0, 0.87, 0.66), albedoTone);`
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
     float grainCoord = vWorldPosDeco.x * 96.0 + vWorldPosDeco.y * 7.0;
     float grain = fract(sin(grainCoord) * 43758.5453) - 0.5;
     normal = normalize(normal + vec3(grain * 0.06, grain * 0.11, 0.0));`
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
     float brassTone = clamp(vToneData.x, 0.0, 1.0);
     float brassAngle = vToneData.y;
     vec2 bandDir = vec2(cos(brassAngle), sin(brassAngle));
     float bandCoord = dot(vWorldPosDeco.xy, bandDir) * 0.85 + uTime * 0.16;
     float band = 0.5 + 0.5 * sin(bandCoord * 2.4);
     float edgeStop = smoothstep(0.35, 0.65, band) * smoothstep(0.95, 0.7, band);
     vec3 darkTone = vec3(0.467, 0.325, 0.125);
     vec3 lightTone = vec3(0.729, 0.612, 0.447);
     vec3 brassTint = mix(darkTone, lightTone, brassTone);
     totalEmissiveRadiance *= mix(0.55, 1.12, brassTone);
     totalEmissiveRadiance += brassTint * (edgeStop * 0.42 + band * 0.08);
     float glintGate = step(0.965, fract(sin(dot(floor(vWorldPosDeco.xy * 42.0), vec2(12.9898, 78.233))) * 43758.5453));
     totalEmissiveRadiance += vec3(1.0, 0.94, 0.82) * glintGate * 0.85 * brassTone;`
  );
}

function injectOpacity(shader: FrameShader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `#include <opaque_fragment>
     gl_FragColor.a *= uOpacity;`
  );
}

const CACHE_KEYS: Record<FrameFinish, string> = {
  gold: 'gatsby-gold-frame-trim-v2',
  brass: 'gatsby-brass-frame-trim-v1',
};

/** Program key per finish: a cache key shared by two shaders would collide. */
export function frameMaterialCacheKey(finish: FrameFinish = 'gold'): string {
  return CACHE_KEYS[finish];
}

export function createGoldFrameMaterial(
  uniforms: GoldFrameUniforms,
  options: GoldFrameMaterialOptions = {}
): THREE.MeshStandardMaterial {
  const finish = options.finish ?? 'gold';
  const brass = finish === 'brass';
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(brass ? '#ba9c72' : '#f4c95d'),
    emissive: new THREE.Color(brass ? '#1b1206' : '#281802'),
    metalness: brass ? 0.9 : 0.96,
    roughness: brass ? 0.32 : 0.17,
    envMapIntensity: brass ? 1.7 : 2.35,
    transparent: true,
    side: THREE.DoubleSide,
  });
  material.customProgramCacheKey = () => frameMaterialCacheKey(finish);
  material.onBeforeCompile = (shader) => {
    bindUniforms(shader, uniforms);
    injectVertexAttributes(shader);
    injectFragmentUniforms(shader);
    injectTrimReveal(shader);
    injectGoldSheen(shader);
    if (brass) injectBrass(shader);
    injectOpacity(shader);
  };
  return material;
}
