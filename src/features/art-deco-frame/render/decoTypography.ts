import * as THREE from 'three';
import { DECO_ALPHABET, type GlyphDef } from '../model/decoAlphabet';
import type { DecoTextOptions, DecoTextRig } from '../model/decoText';
export type { DecoTextOptions, DecoTextRig } from '../model/decoText';

/**
 * Renders a word or phrase using the bespoke Art Deco Pinstripe system,
 * derives a chiseled chamfer normal map + metallic roughness map, and builds
 * a 3D multi-slice gold-extruded + platinum-faced WebGL group.
 *
 * Split into layout → mask → heightfield → textures → materials → slices
 * (ADDENDUM-032). This was one 371-line function, which ADDENDUM-001 §4 listed as
 * debt with the plan "split rasteriser / normal-synth / mesh on next touch". The
 * split is pure code motion: `decoTypography.test.ts` pins the produced rig with a
 * golden digest, so any numerical drift would fail before this file was changed.
 */

/** Supersampled pixel cap height: the mask is drawn at this size, then sampled. */
const CAP_HEIGHT = 220;
const PAD_X = 56;
const PAD_Y = 54;
/** The mask canvas never grows past this width; wider text is scaled to fit. */
const MAX_CANVAS_W = 2560;
const MIN_CANVAS_W = 256;
/** Distance beyond which a pixel counts as fully outside the glyph. */
const FAR = 1e6;
/** The mask's alpha at or above which a pixel is "inside" for the chamfer pass. */
const INSIDE_ALPHA = 0.35;
const SLICES = 11;

interface GlyphPlacement {
  ch: string;
  def: GlyphDef | null;
  x: number;
  glyphW: number;
  pinstriped: boolean;
}

interface TextLayout {
  placements: GlyphPlacement[];
  /** Total tracked width of the drawn glyphs, in canvas pixels. */
  cursorX: number;
  canvasW: number;
  canvasH: number;
  scaleFit: number;
  capH: number;
  strokeW: number;
}

interface FaceMaps {
  color: THREE.CanvasTexture;
  normal: THREE.DataTexture;
}

/** The rasterised word, ready for the bevel and texture passes. */
interface MaskSurface {
  maskData: Uint8ClampedArray;
  width: number;
  height: number;
}

type RevealUniforms = {
  uReveal: { value: number };
  uShimmer: { value: number };
  uOpacity: { value: number };
};

/** Stroke weight for a weight name; the hero face is cut heaviest. */
function strokeFor(weight: DecoTextOptions['weight']): number {
  if (weight === 'hero') return 32;
  if (weight === 'regular') return 24;
  return 18;
}

/**
 * Places every glyph on the mask, alternating pinstripes over the *visible*
 * letters only: punctuation and `I` stay solid so a thin stem is not sheared in
 * two.
 */
function layoutGlyphs(options: DecoTextOptions): TextLayout {
  const weight = options.weight ?? 'hero';
  const tracking = options.tracking ?? (weight === 'hero' ? 0.18 : 0.24);
  const alternatePinstripes = options.alternatePinstripes ?? true;
  const capH = CAP_HEIGHT;
  const strokeW = strokeFor(weight);

  const chars = Array.from((options.text || ' ').toUpperCase());
  let cursorX = 0;
  let visibleIndex = 0;
  const placements: GlyphPlacement[] = [];

  for (const ch of chars) {
    if (ch === ' ') {
      cursorX += capH * 0.36;
      continue;
    }
    const def = DECO_ALPHABET[ch] ?? DECO_ALPHABET['O'];
    const glyphW = def.w * capH;
    const isPunct = ch === '.' || ch === '·' || ch === '-' || ch === "'" || ch === 'I' || ch === '1';
    // The alternation counts letters, not punctuation, so a period never breaks it.
    placements.push({ ch, def, x: cursorX, glyphW, pinstriped: alternatePinstripes && !isPunct && visibleIndex % 2 === 0 });
    if (!isPunct) visibleIndex += 1;
    cursorX += glyphW + capH * tracking;
  }

  // Drop the trailing tracking after the last glyph.
  cursorX = placements.length > 0 ? cursorX - capH * tracking : capH * 0.5;
  const canvasW = Math.min(MAX_CANVAS_W, Math.max(MIN_CANVAS_W, Math.ceil(cursorX + PAD_X * 2)));
  const canvasH = capH + PAD_Y * 2;
  const scaleFit = cursorX + PAD_X * 2 > MAX_CANVAS_W ? (MAX_CANVAS_W - PAD_X * 2) / cursorX : 1.0;
  return { placements, cursorX, canvasW, canvasH, scaleFit, capH, strokeW };
}

interface StrokeRequest {
  sCtx: CanvasRenderingContext2D;
  item: GlyphPlacement;
  strokeW: number;
  capH: number;
}

/** Strokes one glyph, pinstriped or solid, into the scratch context. */
function strokeGlyph({ sCtx, item, strokeW, capH }: StrokeRequest): void {
  const path = new Path2D();
  item.def!.build(path, item.glyphW, capH);

  sCtx.lineCap = 'butt';
  sCtx.lineJoin = 'miter';
  sCtx.miterLimit = 6;

  if (!item.pinstriped) {
    sCtx.globalCompositeOperation = 'source-over';
    sCtx.strokeStyle = '#ffffff';
    sCtx.lineWidth = strokeW;
    sCtx.stroke(path);
    return;
  }
  // Four concentric inline stripes separated by three carved hollow channels.
  for (const [width, keep] of [
    [strokeW, true],
    [strokeW * 0.72, false],
    [strokeW * 0.44, true],
    [strokeW * 0.15, false],
  ] as const) {
    sCtx.globalCompositeOperation = keep ? 'source-over' : 'destination-out';
    sCtx.strokeStyle = '#ffffff';
    sCtx.lineWidth = width;
    sCtx.stroke(path);
  }
}

/** Rasterises the whole word into one alpha mask (white = metal, clear = empty). */
function rasteriseMask(layout: TextLayout): MaskSurface {
  const { placements, cursorX, canvasW, canvasH, scaleFit, capH, strokeW } = layout;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = canvasW;
  maskCanvas.height = canvasH;
  const mCtx = maskCanvas.getContext('2d')!;

  // Scratch canvas per glyph so the concentric cuts fuse cleanly at junctions.
  const scratch = document.createElement('canvas');
  scratch.width = Math.ceil(capH * 1.4);
  scratch.height = canvasH;
  const sCtx = scratch.getContext('2d')!;
  const offsetStartX = (canvasW - cursorX * scaleFit) * 0.5;

  for (const item of placements) {
    if (!item.def) continue;
    sCtx.clearRect(0, 0, scratch.width, scratch.height);
    sCtx.save();
    sCtx.translate(strokeW * 0.85, PAD_Y);
    sCtx.scale(scaleFit, scaleFit);
    strokeGlyph({ sCtx, item, strokeW, capH });
    sCtx.restore();
    mCtx.drawImage(scratch, offsetStartX + item.x * scaleFit - strokeW * 0.85, 0);
  }
  return { maskData: mCtx.getImageData(0, 0, canvasW, canvasH).data, width: canvasW, height: canvasH };
}

interface ChamferRequest {
  surface: MaskSurface;
  /** The stroke width in pixels: the bevel never runs deeper than the stem. */
  strokeW: number;
  scaleFit: number;
}

/** Two-pass chamfer distance from the glyph edge, capped into a 0..1 height. */
function chamferHeights({ surface, strokeW, scaleFit }: ChamferRequest): Float32Array {
  const { maskData, width: canvasW, height: canvasH } = surface;
  const maxBevel = strokeW * 0.48 * scaleFit;
  const dist = new Float32Array(canvasW * canvasH);
  for (let i = 0; i < canvasW * canvasH; i += 1) {
    dist[i] = maskData[i * 4 + 3] / 255 > INSIDE_ALPHA ? FAR : 0;
  }
  const relax = (index: number, neighbours: readonly number[]) => {
    if (dist[index] > 0) dist[index] = Math.min(dist[index], ...neighbours);
  };
  for (let y = 1; y < canvasH - 1; y += 1) {
    const row = y * canvasW;
    for (let x = 1; x < canvasW - 1; x += 1) {
      const idx = row + x;
      relax(idx, [dist[idx - 1] + 1, dist[idx - canvasW] + 1, dist[idx - canvasW - 1] + 1.414, dist[idx - canvasW + 1] + 1.414]);
    }
  }
  for (let y = canvasH - 2; y >= 1; y -= 1) {
    const row = y * canvasW;
    for (let x = canvasW - 2; x >= 1; x -= 1) {
      const idx = row + x;
      relax(idx, [dist[idx + 1] + 1, dist[idx + canvasW] + 1, dist[idx + canvasW + 1] + 1.414, dist[idx + canvasW - 1] + 1.414]);
    }
  }
  const heightField = new Float32Array(canvasW * canvasH);
  const ceiling = Math.max(2.0, maxBevel);
  for (let i = 0; i < canvasW * canvasH; i += 1) heightField[i] = Math.min(1.0, dist[i] / ceiling);
  return heightField;
}

/** Champagne gold outside, mirror platinum on the crest — or plain 24k gold. */
function faceColour(height: number, finish: DecoTextOptions['finish']): [number, number, number] {
  if (finish !== 'platinum-gold') {
    const crest = Math.min(1, Math.max(0, height));
    return [Math.round(215 + crest * 40), Math.round(166 + crest * 58), Math.round(58 + crest * 78)];
  }
  const crest = Math.min(1, Math.max(0, (height - 0.22) / 0.55));
  return [
    Math.round(238 * (1 - crest) + 247 * crest),
    Math.round(196 * (1 - crest) + 246 * crest),
    Math.round(108 * (1 - crest) + 249 * crest),
  ];
}

interface FaceRequest {
  surface: MaskSurface;
  heightField: Float32Array;
  finish: DecoTextOptions['finish'];
}

/** Builds the albedo/alpha canvas and the chisel normal map from the heightfield. */
function buildFaceMaps({ surface, heightField, finish }: FaceRequest): FaceMaps {
  const { maskData, width: canvasW, height: canvasH } = surface;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = canvasW;
  colorCanvas.height = canvasH;
  const cCtx = colorCanvas.getContext('2d')!;
  const cImg = cCtx.createImageData(canvasW, canvasH);
  const normalBytes = new Uint8Array(canvasW * canvasH * 4);
  const bevelStrength = 3.8;

  for (let y = 0; y < canvasH; y += 1) {
    for (let x = 0; x < canvasW; x += 1) {
      const idx = y * canvasW + x;
      const h = heightField[idx];
      const xm = Math.max(0, x - 1);
      const xp = Math.min(canvasW - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(canvasH - 1, y + 1);
      const dx = (heightField[y * canvasW + xp] - heightField[y * canvasW + xm]) * bevelStrength;
      const dy = (heightField[yp * canvasW + x] - heightField[ym * canvasW + x]) * bevelStrength;
      const nx = -dx;
      const ny = dy;
      const inv = 1.0 / Math.sqrt(nx * nx + ny * ny + 1.0);

      normalBytes[idx * 4] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      normalBytes[idx * 4 + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      normalBytes[idx * 4 + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      normalBytes[idx * 4 + 3] = 255;

      const [r, g, b] = faceColour(h, finish);
      cImg.data[idx * 4] = r;
      cImg.data[idx * 4 + 1] = g;
      cImg.data[idx * 4 + 2] = b;
      cImg.data[idx * 4 + 3] = maskData[idx * 4 + 3];
    }
  }
  cCtx.putImageData(cImg, 0, 0);

  const color = new THREE.CanvasTexture(colorCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = 8;
  const normal = new THREE.DataTexture(normalBytes, canvasW, canvasH, THREE.RGBAFormat);
  normal.flipY = true;
  normal.needsUpdate = true;
  return { color, normal };
}

/** Adds the centre-out curtain reveal, the travelling glint and the tip spark. */
function injectTextRevealShader(
  material: THREE.MeshStandardMaterial,
  isFront: boolean,
  uniforms: RevealUniforms
): void {
  material.customProgramCacheKey = () => (isFront ? 'gatsby-deco-text-front-v1' : 'gatsby-deco-text-side-v1');
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = uniforms.uReveal;
    shader.uniforms.uShimmer = uniforms.uShimmer;
    shader.uniforms.uOpacity = uniforms.uOpacity;

    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n varying vec2 vDecoUv;');
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vDecoUv = uv;');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uReveal;
       uniform float uShimmer;
       uniform float uOpacity;
       varying vec2 vDecoUv;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `#include <alphatest_fragment>
       // Center-out symmetrical Art Deco curtain reveal
       float distFromCenter = abs(vDecoUv.x - 0.5) * 2.0;
       float edgeMask = smoothstep(uReveal * 1.18, max(0.0, uReveal * 1.18 - 0.16), distFromCenter);
       if (edgeMask <= 0.01 || uOpacity <= 0.01) discard;
       diffuseColor.a *= edgeMask * uOpacity;`
    );
    if (!isFront) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       // Travelling diagonal anamorphic light glint + reveal edge spark
       float diag = vDecoUv.x * 0.85 + vDecoUv.y * 0.35;
       float sheenPos = fract(uShimmer * 0.25) * 1.8 - 0.3;
       float glint = exp(-pow((diag - sheenPos) * 9.5, 2.0));
       float distFromCenter2 = abs(vDecoUv.x - 0.5) * 2.0;
       float tipGlow = exp(-pow((distFromCenter2 - uReveal * 1.05) * 12.0, 2.0)) * step(0.02, uReveal) * step(uReveal, 0.96);
       totalEmissiveRadiance += vec3(1.0, 0.86, 0.52) * (glint * 0.65 + tipGlow * 1.35);`
    );
  };
}

interface GroupRequest {
  planeGeo: THREE.PlaneGeometry;
  maps: FaceMaps;
  finish: DecoTextOptions['finish'];
  depth: number;
  uniforms: RevealUniforms;
}

/** Front chiselled face plus the stack of gold side-wall slices behind it. */
function buildTextGroup({ planeGeo, maps, finish, depth, uniforms }: GroupRequest): {
  group: THREE.Group;
  front: THREE.MeshStandardMaterial;
  side: THREE.MeshStandardMaterial;
} {
  const front = new THREE.MeshStandardMaterial({
    map: maps.color,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(1.45, 1.45),
    metalness: 0.96,
    roughness: finish === 'platinum-gold' ? 0.13 : 0.18,
    alphaTest: 0.24,
    transparent: true,
    side: THREE.DoubleSide,
    envMapIntensity: 2.1,
  });
  injectTextRevealShader(front, true, uniforms);

  const side = new THREE.MeshStandardMaterial({
    map: maps.color,
    normalMap: maps.normal,
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
  injectTextRevealShader(side, false, uniforms);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(planeGeo, front));
  for (let s = 1; s <= SLICES; s += 1) {
    const t = s / SLICES;
    const slice = new THREE.Mesh(planeGeo, side);
    slice.position.z = -t * depth;
    // A slight expansion toward the rear reads as a chamfered gold block.
    const bevelScale = 1 + t * 0.008;
    slice.scale.set(bevelScale, bevelScale, 1);
    group.add(slice);
  }
  return { group, front, side };
}

export function createExtrudedDecoTextMesh(options: DecoTextOptions): DecoTextRig {
  const finish = options.finish ?? 'platinum-gold';
  const layout = layoutGlyphs(options);
  const surface = rasteriseMask(layout);
  const heightField = chamferHeights({ surface, strokeW: layout.strokeW, scaleFit: layout.scaleFit });
  const maps = buildFaceMaps({ surface, heightField, finish });

  const aspect = layout.canvasW / layout.canvasH;
  const worldH = options.worldHeight * ((layout.canvasH / layout.capH) * 0.72);
  const worldW = worldH * aspect;
  const planeGeo = new THREE.PlaneGeometry(worldW, worldH);

  // Shared reveal/shimmer uniforms across the front face and the extruded shells.
  const uniforms: RevealUniforms = { uReveal: { value: 1.0 }, uShimmer: { value: 0.0 }, uOpacity: { value: 1.0 } };
  const depth = options.extrudeDepth ?? Math.min(0.22, options.worldHeight * 0.14);
  const { group, front, side } = buildTextGroup({ planeGeo, maps, finish, depth, uniforms });

  return {
    group,
    width: worldW,
    height: worldH,
    setReveal: (reveal: number, shimmerPhase: number, opacity = 1.0) => {
      uniforms.uReveal.value = THREE.MathUtils.clamp(reveal, 0, 1);
      uniforms.uShimmer.value = shimmerPhase;
      uniforms.uOpacity.value = THREE.MathUtils.clamp(opacity, 0, 1);
    },
    dispose: () => {
      planeGeo.dispose();
      front.dispose();
      side.dispose();
      maps.color.dispose();
      maps.normal.dispose();
    },
  };
}
