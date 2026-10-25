import * as THREE from 'three';

export interface GoldFrameUniforms {
  uDraw: { value: number };
  uPartOpen: { value: number };
  uOpacity: { value: number };
  uTime: { value: number };
  /** 0 = delivered bright gold, 1 = antique brass (ADDENDUM-021 §3.6). */
  uBrass: { value: number };
}

export type FrameFinish = 'gold' | 'brass';

export interface GoldFrameMaterialOptions {
  finish?: FrameFinish;
}

type FrameShader = Parameters<THREE.Material['onBeforeCompile']>[0];

export function createGoldFrameUniforms(draw = 0, opacity = 1): GoldFrameUniforms {
  return {
    uDraw: { value: draw },
    uPartOpen: { value: 0 },
    uOpacity: { value: opacity },
    uTime: { value: 0 },
    uBrass: { value: 0 },
  };
}

interface FinishFormula {
  source: string;
  layers?: readonly { source: string; enabled: boolean }[];
}

/** Brass applies to a lattice foundation or an enabled lattice layer. */
export function finishForFormula(formula: FinishFormula): FrameFinish {
  if (formula.source === 'lattice') return 'brass';
  const hasLatticeLayer = (formula.layers ?? [])
    .some((layer) => layer.source === 'lattice' && layer.enabled);
  return hasLatticeLayer ? 'brass' : 'gold';
}

export function applyFinish(uniforms: GoldFrameUniforms, finish: FrameFinish): void {
  uniforms.uBrass.value = finish === 'brass' ? 1 : 0;
}

function bindUniforms(shader: FrameShader, uniforms: GoldFrameUniforms) {
  shader.uniforms.uDraw = uniforms.uDraw;
  shader.uniforms.uPartOpen = uniforms.uPartOpen;
  shader.uniforms.uOpacity = uniforms.uOpacity;
  shader.uniforms.uTime = uniforms.uTime;
  shader.uniforms.uBrass = uniforms.uBrass;
}

function injectVertexAttributes(shader: FrameShader) {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
     attribute vec3 aPathData;
     attribute vec2 aTone;
     uniform float uPartOpen;
     varying vec3 vPathData;
     varying vec2 vToneDeco;
     varying vec3 vWorldPosDeco;`
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     vPathData = aPathData;
     vToneDeco = aTone;
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
     uniform float uBrass;
     varying vec3 vPathData;
     varying vec2 vToneDeco;
     varying vec3 vWorldPosDeco;
     float decoHash(float n) { return fract(sin(n) * 43758.5453123); }`
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

/**
 * Antique brass: a per-rail mix from dark #775320 to light #ba9c72 along the
 * rail's gradient angle, with scratch grain. Every term is scaled by uBrass,
 * so the default gold finish is mathematically unchanged when uBrass is 0.
 */
function injectBrass(shader: FrameShader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     float brassGradCoord = vWorldPosDeco.x * cos(vToneDeco.y) + vWorldPosDeco.y * sin(vToneDeco.y);
     float brassTone = clamp(vToneDeco.x + brassGradCoord * 0.06, 0.0, 1.0);
     vec3 brassDark = pow(vec3(0.467, 0.325, 0.125), vec3(2.2));
     vec3 brassLight = pow(vec3(0.729, 0.612, 0.447), vec3(2.2));
     diffuseColor.rgb = mix(diffuseColor.rgb, mix(brassDark, brassLight, brassTone), uBrass);`
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <roughnessmap_fragment>',
    `#include <roughnessmap_fragment>
     float scratchLine = decoHash(floor(vWorldPosDeco.x * 240.0));
     float scratch = step(0.93, scratchLine) * 0.3;
     roughnessFactor = mix(roughnessFactor, clamp(0.32 + scratch, 0.0, 1.0), uBrass);`
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <metalnessmap_fragment>',
    `#include <metalnessmap_fragment>
     metalnessFactor = mix(metalnessFactor, 0.9, uBrass);`
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
     totalEmissiveRadiance += vec3(1.0, 0.88, 0.52) * (tipSpark * 2.2 + sheen * 0.48);
     float rakingBand = smoothstep(0.35, 0.95, sin(brassGradCoord * 5.5 - uTime * 0.22) * 0.5 + 0.5);
     float glintCell = decoHash(floor(vWorldPosDeco.x * 2.7) * 31.7 + floor(vWorldPosDeco.y * 2.7) * 17.3);
     float glint = step(0.965, glintCell) * sheen * 1.4;
     totalEmissiveRadiance += vec3(0.93, 0.78, 0.5) * (rakingBand * 0.12 + glint) * uBrass;`
  );
}

function injectOpacity(shader: FrameShader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `#include <opaque_fragment>
     gl_FragColor.a *= uOpacity;`
  );
}

export function createGoldFrameMaterial(
  uniforms: GoldFrameUniforms,
  options: GoldFrameMaterialOptions = {},
): THREE.MeshStandardMaterial {
  applyFinish(uniforms, options.finish ?? 'gold');
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f4c95d'),
    emissive: new THREE.Color('#281802'),
    metalness: 0.96,
    roughness: 0.17,
    envMapIntensity: 2.35,
    transparent: true,
    side: THREE.DoubleSide,
  });
  material.userData.uniforms = uniforms;
  material.customProgramCacheKey = () => 'gatsby-gold-frame-trim-v3';
  material.onBeforeCompile = (shader) => {
    bindUniforms(shader, uniforms);
    injectVertexAttributes(shader);
    injectFragmentUniforms(shader);
    injectTrimReveal(shader);
    injectBrass(shader);
    injectGoldSheen(shader);
    injectOpacity(shader);
  };
  return material;
}
