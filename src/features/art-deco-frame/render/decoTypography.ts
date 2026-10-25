import * as THREE from 'three';
import { DECO_ALPHABET, type GlyphDef } from '../model/decoAlphabet';
import type { DecoTextOptions, DecoTextRig } from '../model/decoText';
export type { DecoTextOptions, DecoTextRig } from '../model/decoText';

/**
 * Renders a word or phrase using the bespoke Art Deco Pinstripe system,
 * derives a chiseled chamfer normal map + metallic roughness map, and builds
 * a 3D multi-slice gold-extruded + platinum-faced WebGL group.
 */
export function createExtrudedDecoTextMesh(opts: DecoTextOptions): DecoTextRig {
  const rawText = (opts.text || ' ').toUpperCase();
  const finish = opts.finish ?? 'platinum-gold';
  const alternatePinstripes = opts.alternatePinstripes ?? true;
  const weight = opts.weight ?? 'hero';
  const tracking = opts.tracking ?? (weight === 'hero' ? 0.18 : 0.24);

  const capH = 220; // pixel cap height on supersampled canvas
  const strokeW =
    weight === 'hero' ? 32 : weight === 'regular' ? 24 : 18;
  const padX = 56;
  const padY = 54;

  // Measure total layout width
  const chars = Array.from(rawText);
  let cursorX = 0;
  const placements: Array<{
    ch: string;
    def: GlyphDef;
    x: number;
    glyphW: number;
    pinstriped: boolean;
  }> = [];

  let visibleIndex = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === ' ') {
      cursorX += capH * 0.36;
      continue;
    }
    const def = DECO_ALPHABET[ch] ?? DECO_ALPHABET['O'];
    const glyphW = def.w * capH;
    const isPunct = ch === '.' || ch === '·' || ch === '-' || ch === "'" || ch === 'I' || ch === '1';
    const pinstriped =
      alternatePinstripes && !isPunct && visibleIndex % 2 === 0;

    placements.push({
      ch,
      def,
      x: cursorX,
      glyphW,
      pinstriped,
    });

    if (!isPunct) {
      visibleIndex++;
    }
    cursorX += glyphW + capH * tracking;
  }

  if (placements.length > 0) {
    cursorX -= capH * tracking;
  } else {
    cursorX = capH * 0.5;
  }

  const canvasW = Math.min(2560, Math.max(256, Math.ceil(cursorX + padX * 2)));
  const canvasH = capH + padY * 2;
  const scaleFit =
    cursorX + padX * 2 > 2560 ? (2560 - padX * 2) / cursorX : 1.0;

  // Mask canvas (white = metal, transparent = empty)
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = canvasW;
  maskCanvas.height = canvasH;
  const mCtx = maskCanvas.getContext('2d')!;

  // Scratch canvas per glyph so 4-line concentric inline cuts fuse cleanly at junctions
  const scratch = document.createElement('canvas');
  scratch.width = Math.ceil(capH * 1.4);
  scratch.height = canvasH;
  const sCtx = scratch.getContext('2d')!;

  const offsetStartX = (canvasW - cursorX * scaleFit) * 0.5;

  for (const item of placements) {
    sCtx.clearRect(0, 0, scratch.width, scratch.height);
    sCtx.save();
    sCtx.translate(strokeW * 0.85, padY);
    sCtx.scale(scaleFit, scaleFit);

    const path = new Path2D();
    item.def.build(path, item.glyphW, capH);

    sCtx.lineCap = 'butt';
    sCtx.lineJoin = 'miter';
    sCtx.miterLimit = 6;

    if (item.pinstriped) {
      // 4 concentric inline stripes separated by 3 carved hollow channels!
      const w1 = strokeW;
      const w2 = strokeW * 0.72;
      const w3 = strokeW * 0.44;
      const w4 = strokeW * 0.15;

      sCtx.globalCompositeOperation = 'source-over';
      sCtx.strokeStyle = '#ffffff';
      sCtx.lineWidth = w1;
      sCtx.stroke(path);

      sCtx.globalCompositeOperation = 'destination-out';
      sCtx.lineWidth = w2;
      sCtx.stroke(path);

      sCtx.globalCompositeOperation = 'source-over';
      sCtx.strokeStyle = '#ffffff';
      sCtx.lineWidth = w3;
      sCtx.stroke(path);

      sCtx.globalCompositeOperation = 'destination-out';
      sCtx.lineWidth = w4;
      sCtx.stroke(path);
    } else {
      sCtx.globalCompositeOperation = 'source-over';
      sCtx.strokeStyle = '#ffffff';
      sCtx.lineWidth = strokeW;
      sCtx.stroke(path);
    }

    sCtx.restore();

    const destX = offsetStartX + item.x * scaleFit - strokeW * 0.85;
    mCtx.drawImage(scratch, destX, 0);
  }

  // Extract alpha mask & compute fast chamfer bevel heightfield for 3D prismatic normals
  const maskData = mCtx.getImageData(0, 0, canvasW, canvasH).data;
  const dist = new Float32Array(canvasW * canvasH);
  const INF = 1e6;

  for (let i = 0; i < canvasW * canvasH; i++) {
    const a = maskData[i * 4 + 3] / 255;
    dist[i] = a > 0.35 ? INF : 0;
  }

  // Forward pass chamfer distance
  for (let y = 1; y < canvasH - 1; y++) {
    const row = y * canvasW;
    for (let x = 1; x < canvasW - 1; x++) {
      const idx = row + x;
      if (dist[idx] > 0) {
        const d1 = dist[idx - 1] + 1.0;
        const d2 = dist[idx - canvasW] + 1.0;
        const d3 = dist[idx - canvasW - 1] + 1.414;
        const d4 = dist[idx - canvasW + 1] + 1.414;
        dist[idx] = Math.min(dist[idx], d1, d2, d3, d4);
      }
    }
  }

  // Backward pass chamfer distance
  for (let y = canvasH - 2; y >= 1; y--) {
    const row = y * canvasW;
    for (let x = canvasW - 2; x >= 1; x--) {
      const idx = row + x;
      if (dist[idx] > 0) {
        const d1 = dist[idx + 1] + 1.0;
        const d2 = dist[idx + canvasW] + 1.0;
        const d3 = dist[idx + canvasW + 1] + 1.414;
        const d4 = dist[idx + canvasW - 1] + 1.414;
        dist[idx] = Math.min(dist[idx], d1, d2, d3, d4);
      }
    }
  }

  // Cap heightfield to create sharp 45-degree chiseled Art Deco bevel facets
  const maxBevel = strokeW * 0.48 * scaleFit;
  const heightField = new Float32Array(canvasW * canvasH);
  for (let i = 0; i < canvasW * canvasH; i++) {
    heightField[i] = Math.min(1.0, dist[i] / Math.max(2.0, maxBevel));
  }

  // Build Albedo+Alpha texture and Normal DataTexture
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = canvasW;
  colorCanvas.height = canvasH;
  const cCtx = colorCanvas.getContext('2d')!;
  const cImg = cCtx.createImageData(canvasW, canvasH);

  const normalBytes = new Uint8Array(canvasW * canvasH * 4);
  const bevelStrength = 3.8;

  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      const idx = y * canvasW + x;
      const alpha = maskData[idx * 4 + 3];
      const h = heightField[idx];

      // Sample neighbor heights for normal
      const xm = Math.max(0, x - 1);
      const xp = Math.min(canvasW - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(canvasH - 1, y + 1);

      const dx = (heightField[y * canvasW + xp] - heightField[y * canvasW + xm]) * bevelStrength;
      const dy = (heightField[yp * canvasW + x] - heightField[ym * canvasW + x]) * bevelStrength;

      const nx = -dx;
      const ny = dy;
      const nz = 1.0;
      const inv = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);

      normalBytes[idx * 4] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      normalBytes[idx * 4 + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      normalBytes[idx * 4 + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      normalBytes[idx * 4 + 3] = 255;

      if (finish === 'platinum-gold') {
        // Outer bevel edge tinted warm champagne gold; inner crest cool mirror platinum-silver!
        const crest = Math.min(1, Math.max(0, (h - 0.22) / 0.55));
        const r = Math.round(238 * (1 - crest) + 247 * crest);
        const g = Math.round(196 * (1 - crest) + 246 * crest);
        const b = Math.round(108 * (1 - crest) + 249 * crest);
        cImg.data[idx * 4] = r;
        cImg.data[idx * 4 + 1] = g;
        cImg.data[idx * 4 + 2] = b;
        cImg.data[idx * 4 + 3] = alpha;
      } else {
        // Pure 24k champagne gold
        const crest = Math.min(1, Math.max(0, h));
        cImg.data[idx * 4] = Math.round(215 + crest * 40);
        cImg.data[idx * 4 + 1] = Math.round(166 + crest * 58);
        cImg.data[idx * 4 + 2] = Math.round(58 + crest * 78);
        cImg.data[idx * 4 + 3] = alpha;
      }
    }
  }

  cCtx.putImageData(cImg, 0, 0);

  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.anisotropy = 8;

  const normalTex = new THREE.DataTexture(normalBytes, canvasW, canvasH, THREE.RGBAFormat);
  normalTex.flipY = true;
  normalTex.needsUpdate = true;

  const aspect = canvasW / canvasH;
  const worldH = opts.worldHeight * ((canvasH / capH) * 0.72);
  const worldW = worldH * aspect;
  const planeGeo = new THREE.PlaneGeometry(worldW, worldH);

  // Shared reveal/shimmer uniforms across front face & extruded 3D side shells
  const uniforms = {
    uReveal: { value: 1.0 },
    uShimmer: { value: 0.0 },
    uOpacity: { value: 1.0 },
  };

  const injectTextRevealShader = (mat: THREE.MeshStandardMaterial, isFront: boolean) => {
    mat.customProgramCacheKey = () => (isFront ? 'gatsby-deco-text-front-v1' : 'gatsby-deco-text-side-v1');
    mat.onBeforeCompile = (shader) => {
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

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
         // Center-out symmetrical Art Deco curtain reveal
         float distFromCenter = abs(vDecoUv.x - 0.5) * 2.0;
         float edgeMask = smoothstep(uReveal * 1.18, max(0.0, uReveal * 1.18 - 0.16), distFromCenter);
         if (edgeMask <= 0.01 || uOpacity <= 0.01) discard;
         diffuseColor.a *= edgeMask * uOpacity;
        `
      );

      if (isFront) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           // Travelling diagonal anamorphic light glint + reveal edge spark
           float diag = vDecoUv.x * 0.85 + vDecoUv.y * 0.35;
           float sheenPos = fract(uShimmer * 0.25) * 1.8 - 0.3;
           float glint = exp(-pow((diag - sheenPos) * 9.5, 2.0));
           float distFromCenter2 = abs(vDecoUv.x - 0.5) * 2.0;
           float tipGlow = exp(-pow((distFromCenter2 - uReveal * 1.05) * 12.0, 2.0)) * step(0.02, uReveal) * step(uReveal, 0.96);
           totalEmissiveRadiance += vec3(1.0, 0.86, 0.52) * (glint * 0.65 + tipGlow * 1.35);
          `
        );
      }
    };
  };

  // 1. Front Chiseled Platinum/Gold Face
  const frontMat = new THREE.MeshStandardMaterial({
    map: colorTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(1.45, 1.45),
    metalness: 0.96,
    roughness: finish === 'platinum-gold' ? 0.13 : 0.18,
    alphaTest: 0.24,
    transparent: true,
    side: THREE.DoubleSide,
    envMapIntensity: 2.1,
  });
  injectTextRevealShader(frontMat, true);

  // 2. 3D Extruded 24k Gold Side-Wall Shell Stack
  const sideMat = new THREE.MeshStandardMaterial({
    map: colorTex,
    normalMap: normalTex,
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
  injectTextRevealShader(sideMat, false);

  const group = new THREE.Group();
  const frontMesh = new THREE.Mesh(planeGeo, frontMat);
  group.add(frontMesh);

  const depth = opts.extrudeDepth ?? Math.min(0.22, opts.worldHeight * 0.14);
  const slices = 11;
  for (let s = 1; s <= slices; s++) {
    const t = s / slices;
    const sliceMesh = new THREE.Mesh(planeGeo, sideMat);
    sliceMesh.position.z = -t * depth;
    // Slight bevel expansion toward rear creates realistic chamfered gold block silhouette
    const bevelScale = 1 + t * 0.008;
    sliceMesh.scale.set(bevelScale, bevelScale, 1);
    group.add(sliceMesh);
  }

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
      frontMat.dispose();
      sideMat.dispose();
      colorTex.dispose();
      normalTex.dispose();
    },
  };
}
