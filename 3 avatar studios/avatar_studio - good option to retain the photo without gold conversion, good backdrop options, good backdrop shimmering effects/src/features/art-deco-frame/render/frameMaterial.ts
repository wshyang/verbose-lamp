import * as THREE from 'three';

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
     uniform float uPartOpen;
     varying vec3 vPathData;
     varying vec3 vWorldPosDeco;`
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     vPathData = aPathData;
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

function injectOpacity(shader: FrameShader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `#include <opaque_fragment>
     gl_FragColor.a *= uOpacity;`
  );
}

export function createGoldFrameMaterial(uniforms: GoldFrameUniforms): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f4c95d'),
    emissive: new THREE.Color('#281802'),
    metalness: 0.96,
    roughness: 0.17,
    envMapIntensity: 2.35,
    transparent: true,
    side: THREE.DoubleSide,
  });
  material.customProgramCacheKey = () => 'gatsby-gold-frame-trim-v2';
  material.onBeforeCompile = (shader) => {
    bindUniforms(shader, uniforms);
    injectVertexAttributes(shader);
    injectFragmentUniforms(shader);
    injectTrimReveal(shader);
    injectGoldSheen(shader);
    injectOpacity(shader);
  };
  return material;
}