import * as THREE from 'three';
import type { DecoTextOptions, DecoTextRig } from '../model/decoText';
import { buildFaceMaps, type FaceMaps } from './typography/faceMaps';
import { CAP_HEIGHT, layoutGlyphs } from './typography/layout';
import { chamferHeights, rasteriseMask } from './typography/mask';
import { createRevealUniforms, injectTextRevealShader, type RevealUniforms } from './typography/revealMaterial';
export type { DecoTextOptions, DecoTextRig } from '../model/decoText';

/** Number of stacked shells behind the front face that give the type its extruded depth. */
const SLICES = 11;
/** World-space scale of the supersampled canvas height. */
const WORLD_SCALE = 0.72;
/** Each shell is slightly larger than the one in front, which reads as a chamfered gold block. */
const BEVEL_EXPANSION = 0.008;

function frontMaterial(maps: FaceMaps, finish: DecoTextOptions['finish']): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: maps.colorTex,
    normalMap: maps.normalTex,
    normalScale: new THREE.Vector2(1.45, 1.45),
    metalness: 0.96,
    roughness: finish === 'platinum-gold' ? 0.13 : 0.18,
    alphaTest: 0.24,
    transparent: true,
    side: THREE.DoubleSide,
    envMapIntensity: 2.1,
  });
}

function sideMaterial(maps: FaceMaps): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: maps.colorTex,
    normalMap: maps.normalTex,
    normalScale: new THREE.Vector2(0.8, 0.8),
    color: new THREE.Color('#d89c27'),
    emissive: new THREE.Color('#2a1903'),
    metalness: 0.95,
    roughness: 0.25,
    alphaTest: 0.3,
    transparent: true,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
  });
}

interface StackRequest {
  plane: THREE.PlaneGeometry;
  front: THREE.MeshStandardMaterial;
  side: THREE.MeshStandardMaterial;
  depth: number;
}

/** The front face plus the shells that extrude it backwards. */
function buildGroup({ plane, front, side, depth }: StackRequest): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(plane, front));
  for (let s = 1; s <= SLICES; s++) {
    const t = s / SLICES;
    const shell = new THREE.Mesh(plane, side);
    shell.position.z = -t * depth;
    const scale = 1 + t * BEVEL_EXPANSION;
    shell.scale.set(scale, scale, 1);
    group.add(shell);
  }
  return group;
}

function revealSetter(uniforms: RevealUniforms): DecoTextRig['setReveal'] {
  return (reveal, shimmerPhase, opacity = 1.0) => {
    uniforms.uReveal.value = THREE.MathUtils.clamp(reveal, 0, 1);
    uniforms.uShimmer.value = shimmerPhase;
    uniforms.uOpacity.value = THREE.MathUtils.clamp(opacity, 0, 1);
  };
}

/**
 * Renders a word or phrase using the bespoke Art Deco Pinstripe system, derives a chiseled
 * chamfer normal map, and builds a 3D multi-slice gold-extruded, platinum-faced group.
 */
export function createExtrudedDecoTextMesh(opts: DecoTextOptions): DecoTextRig {
  const layout = layoutGlyphs(opts);
  const mask = rasteriseMask(layout);
  const heights = chamferHeights({ mask, strokeW: layout.strokeW, scaleFit: layout.scaleFit });
  const finish = opts.finish ?? 'platinum-gold';
  const maps = buildFaceMaps({ mask, heights, finish });

  const worldH = opts.worldHeight * ((layout.canvasH / CAP_HEIGHT) * WORLD_SCALE);
  const worldW = worldH * (layout.canvasW / layout.canvasH);
  const plane = new THREE.PlaneGeometry(worldW, worldH);

  const uniforms = createRevealUniforms();
  const front = frontMaterial(maps, finish);
  const side = sideMaterial(maps);
  injectTextRevealShader(front, uniforms, true);
  injectTextRevealShader(side, uniforms, false);

  const depth = opts.extrudeDepth ?? Math.min(0.22, opts.worldHeight * 0.14);
  return {
    group: buildGroup({ plane, front, side, depth }),
    width: worldW,
    height: worldH,
    setReveal: revealSetter(uniforms),
    dispose: () => {
      plane.dispose();
      front.dispose();
      side.dispose();
      maps.colorTex.dispose();
      maps.normalTex.dispose();
    },
  };
}
