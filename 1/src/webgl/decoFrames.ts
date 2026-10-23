import * as THREE from 'three';
import { createExtrudedDecoTextMesh, DecoTextRig } from './decoTypography';
import { HeroTitleConfig, SequenceChapter } from '../types/sequence';
import { buildFrameGeometry, type FrameGeometryStats, type FrameSpec, type FrameStyle } from './frame';

interface GeometryAccumulator {
  positions: number[];
  normals: number[];
  pathData: number[];
  indices: number[];
}

function appendChamferedPolyline(acc: GeometryAccumulator, spec: FrameSpec) {
  const pts = spec.points;
  if (pts.length < 2) return;

  const isClosed = Boolean(spec.closed);
  const count = pts.length;

  // Compute cumulative arc length for normalized uProgress [0..1]
  const cumLen: number[] = [0];
  let totalLen = 0;
  const segCount = isClosed ? count : count - 1;

  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % count];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    totalLen += Math.max(1e-4, d);
    cumLen.push(totalLen);
  }

  if (totalLen < 1e-4) return;

  // Cross-section profile in (lateralOffset, zOffset, normalLateral, normalZ)
  // 6 vertices across the front + bevels + sides for crisp jewelry-grade facets:
  const hw = spec.width * 0.5;
  const cw = spec.width * 0.26; // flat inner crest half-width
  const fz = spec.depth * 0.5;
  const bz = -spec.depth * 0.5;
  const invSqrt2 = 0.70710678;

  const profile: Array<[number, number, number, number]> = [
    [-hw, bz, -1, 0],                   // 0: outer left back
    [-hw, fz * 0.25, -invSqrt2, invSqrt2], // 1: left chamfer outer
    [-cw, fz, -0.25, 0.968],            // 2: crest left edge
    [cw, fz, 0.25, 0.968],              // 3: crest right edge
    [hw, fz * 0.25, invSqrt2, invSqrt2],   // 4: right chamfer outer
    [hw, bz, 1, 0],                     // 5: outer right back
  ];
  const profN = profile.length;

  const ringCount = isClosed ? count + 1 : count;
  const baseVertex = acc.positions.length / 3;

  // Determine parting direction for theatrical gate opening
  let centerX = 0;
  for (const p of pts) centerX += p.x;
  centerX /= pts.length;

  for (let r = 0; r < ringCount; r++) {
    const idx = r % count;
    const curr = pts[idx];

    // Compute miter normal in XY plane
    let tx = 0;
    let ty = 0;

    if (isClosed || (r > 0 && r < ringCount - 1)) {
      const prev = pts[(idx - 1 + count) % count];
      const next = pts[(idx + 1) % count];
      let d1x = curr.x - prev.x;
      let d1y = curr.y - prev.y;
      const l1 = Math.hypot(d1x, d1y) || 1;
      d1x /= l1;
      d1y /= l1;

      let d2x = next.x - curr.x;
      let d2y = next.y - curr.y;
      const l2 = Math.hypot(d2x, d2y) || 1;
      d2x /= l2;
      d2y /= l2;

      const n1x = -d1y;
      const n1y = d1x;
      const n2x = -d2y;
      const n2y = d2x;

      let mx = n1x + n2x;
      let my = n1y + n2y;
      const ml = Math.hypot(mx, my);
      if (ml < 1e-3) {
        tx = n1x;
        ty = n1y;
      } else {
        mx /= ml;
        my /= ml;
        const dot = Math.max(0.38, mx * n1x + my * n1y);
        const miterScale = Math.min(2.3, 1.0 / dot);
        tx = mx * miterScale;
        ty = my * miterScale;
      }
    } else if (r === 0) {
      const next = pts[1];
      const dx = next.x - curr.x;
      const dy = next.y - curr.y;
      const l = Math.hypot(dx, dy) || 1;
      tx = -dy / l;
      ty = dx / l;
    } else {
      const prev = pts[count - 2];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const l = Math.hypot(dx, dy) || 1;
      tx = -dy / l;
      ty = dx / l;
    }

    const uNorm = cumLen[r] / totalLen;
    const partSide =
      spec.partDir !== undefined && spec.partDir !== 0
        ? spec.partDir
        : curr.x < -0.02
          ? -1
          : curr.x > 0.02
            ? 1
            : centerX < 0
              ? -1
              : 1;

    // Normalize lateral direction for accurate normals
    const nLen = Math.hypot(tx, ty) || 1;
    const unx = tx / nLen;
    const uny = ty / nLen;

    for (let p = 0; p < profN; p++) {
      const [lat, zOff, nLat, nZ] = profile[p];
      acc.positions.push(curr.x + tx * lat, curr.y + ty * lat, spec.z + zOff);
      acc.normals.push(unx * nLat, uny * nLat, nZ);
      acc.pathData.push(uNorm, spec.delay, partSide);
    }
  }

  for (let r = 0; r < ringCount - 1; r++) {
    const rowA = baseVertex + r * profN;
    const rowB = baseVertex + (r + 1) * profN;
    for (let p = 0; p < profN - 1; p++) {
      const a = rowA + p;
      const b = rowA + p + 1;
      const c = rowB + p + 1;
      const d = rowB + p;
      acc.indices.push(a, d, c, a, c, b);
    }
  }
}

/** Sweeps every rail into one merged buffer: one draw call per card. */
function buildFrameBufferGeometry(specs: FrameSpec[]): THREE.BufferGeometry {
  const acc: GeometryAccumulator = { positions: [], normals: [], pathData: [], indices: [] };
  for (const spec of specs) {
    appendChamferedPolyline(acc, spec);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(acc.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normals, 3));
  geometry.setAttribute('aPathData', new THREE.Float32BufferAttribute(acc.pathData, 3));
  geometry.setIndex(acc.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export interface GatsbyCardRig {
  chapter: SequenceChapter;
  root: THREE.Group;
  /** Query: current frame geometry statistics. */
  getStats: () => FrameGeometryStats;
  /** Modifier: regenerate only the golden frame (text, material and shader persist). */
  applyFrameStyle: (style: FrameStyle) => void;
  updateState: (params: {
    drawProgress: number; // 0..1 golden frame trim-path draw
    textProgress: number; // 0..1 typography reveal
    partOpen: number;     // 0..1 theatrical gate parting as camera flies through
    opacity: number;      // 0..1 master fade
    time: number;
  }) => void;
  dispose: () => void;
}

export interface GatsbyCardOptions {
  chapter: SequenceChapter;
  heroTitle?: HeroTitleConfig;
  /** Architecture genome + ornament intricacy; (G0, 0.50) is the original frame */
  style: FrameStyle;
}

/**
 * Builds a complete 3D Title Card Assembly (Multi-Plane Golden Frame + Extruded Deco Typography)
 */
export function createGatsbyCardRig({
  chapter,
  heroTitle,
  style,
}: GatsbyCardOptions): GatsbyCardRig {
  const root = new THREE.Group();
  root.position.z = chapter.zPosition;

  const isHero = chapter.archetype === 'gatsby_hero';
  const isMonogram = chapter.archetype === 'monogram_gate';

  const topStr = isHero
    ? (heroTitle?.keystone ?? chapter.topLine ?? 'THE')
    : (chapter.topLine ?? '');
  const midStr = isHero
    ? (heroTitle?.preTitle ?? chapter.middleLine ?? 'GREAT')
    : (chapter.middleLine ?? '');
  const mainStr = isHero
    ? (heroTitle?.mainTitle ?? chapter.mainLine ?? 'GATSBY')
    : chapter.mainLine;
  const botStr = isHero
    ? (heroTitle?.subCredit ?? chapter.bottomLine ?? '')
    : (chapter.bottomLine ?? '');
  const useAlternation = isHero
    ? (heroTitle?.pinstripeAlternation ?? true)
    : true;

  const textRigs: DecoTextRig[] = [];
  let mainTextWidth = 5.4;

  // Build 3D Typography Rigs
  if (!isMonogram) {
    const mainRig = createExtrudedDecoTextMesh({
      text: mainStr || 'GATSBY',
      worldHeight: isHero ? 1.58 : 0.88,
      extrudeDepth: isHero ? 0.22 : 0.14,
      finish: 'platinum-gold',
      alternatePinstripes: useAlternation,
      tracking: isHero ? 0.16 : 0.2,
      weight: 'hero',
    });
    mainRig.group.position.set(0, isHero ? -0.36 : 0.02, 0.14);
    root.add(mainRig.group);
    textRigs.push(mainRig);
    mainTextWidth = mainRig.width;

    if (isHero && midStr.trim()) {
      const midRig = createExtrudedDecoTextMesh({
        text: midStr,
        worldHeight: 0.46,
        extrudeDepth: 0.09,
        finish: 'pure-gold',
        alternatePinstripes: false,
        tracking: 0.56,
        weight: 'regular',
      });
      midRig.group.position.set(0, 1.36, 0.14);
      root.add(midRig.group);
      textRigs.push(midRig);
    }

    if (topStr.trim()) {
      const topRig = createExtrudedDecoTextMesh({
        text: topStr,
        worldHeight: isHero ? 0.34 : 0.28,
        extrudeDepth: 0.07,
        finish: 'pure-gold',
        alternatePinstripes: false,
        tracking: isHero ? 0.32 : 0.42,
        weight: 'regular',
      });
      topRig.group.position.set(0, isHero ? 2.48 : 1.18, 0.16);
      root.add(topRig.group);
      textRigs.push(topRig);
    }

    if (botStr.trim()) {
      const botRig = createExtrudedDecoTextMesh({
        text: botStr,
        worldHeight: isHero ? 0.23 : 0.25,
        extrudeDepth: 0.05,
        finish: 'pure-gold',
        alternatePinstripes: false,
        tracking: 0.34,
        weight: 'fine',
      });
      botRig.group.position.set(0, isHero ? -2.62 : -1.18, 0.12);
      root.add(botRig.group);
      textRigs.push(botRig);
    }
  } else {
    // Monogram gate top & bottom studio billing lines
    if (topStr.trim()) {
      const topRig = createExtrudedDecoTextMesh({
        text: topStr,
        worldHeight: 0.22,
        extrudeDepth: 0.05,
        finish: 'pure-gold',
        alternatePinstripes: false,
        tracking: 0.34,
        weight: 'fine',
      });
      topRig.group.position.set(0, 2.15, 0.12);
      root.add(topRig.group);
      textRigs.push(topRig);
    }
    if (botStr.trim()) {
      const botRig = createExtrudedDecoTextMesh({
        text: botStr,
        worldHeight: 0.22,
        extrudeDepth: 0.05,
        finish: 'pure-gold',
        alternatePinstripes: false,
        tracking: 0.38,
        weight: 'fine',
      });
      botRig.group.position.set(0, -2.15, 0.12);
      root.add(botRig.group);
      textRigs.push(botRig);
    }
  }

  // Derive the golden frame: signature at 0.50, simpler below, additive above.
  const buildGeometryFor = (frameStyle: FrameStyle) =>
    buildFrameGeometry({
      archetype: chapter.archetype,
      mainWidth: mainTextWidth,
      intricacy: frameStyle.intricacy,
      genome: frameStyle.genome,
      family: frameStyle.family,
    });
  const initialGeometry = buildGeometryFor(style);
  let currentStats = initialGeometry.stats;
  const frameGeo = buildFrameBufferGeometry(initialGeometry.specs);

  const frameUniforms = {
    uDraw: { value: 0.0 },
    uPartOpen: { value: 0.0 },
    uOpacity: { value: 1.0 },
    uTime: { value: 0.0 },
  };

  const goldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f4c95d'),
    emissive: new THREE.Color('#281802'),
    metalness: 0.96,
    roughness: 0.17,
    envMapIntensity: 2.35,
    transparent: true,
    side: THREE.DoubleSide,
  });

  goldMat.customProgramCacheKey = () => 'gatsby-gold-frame-trim-v1';
  goldMat.onBeforeCompile = (shader) => {
    shader.uniforms.uDraw = frameUniforms.uDraw;
    shader.uniforms.uPartOpen = frameUniforms.uPartOpen;
    shader.uniforms.uOpacity = frameUniforms.uOpacity;
    shader.uniforms.uTime = frameUniforms.uTime;

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
       // Theatrical gate parting: left & right halves glide open smoothly as camera flies through!
       float openEase = uPartOpen * uPartOpen * (3.0 - 2.0 * uPartOpen);
       transformed.x += aPathData.z * openEase * 5.2;
       vec4 wpDeco = modelMatrix * vec4(transformed, 1.0);
       vWorldPosDeco = wpDeco.xyz;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uDraw;
       uniform float uOpacity;
       uniform float uTime;
       varying vec3 vPathData;
       varying vec3 vWorldPosDeco;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
       float segU = vPathData.x;
       float delay = vPathData.y;
       float localDraw = clamp((uDraw - delay) / max(0.25, 1.0 - delay), 0.0, 1.0);
       // Smooth ease-out curve for crisp Art Deco line shooting
       localDraw = 1.0 - pow(1.0 - localDraw, 2.4);
       if (segU > localDraw || localDraw <= 0.001 || uOpacity <= 0.01) discard;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float segU2 = vPathData.x;
       float delay2 = vPathData.y;
       float localDraw2 = clamp((uDraw - delay2) / max(0.25, 1.0 - delay2), 0.0, 1.0);
       localDraw2 = 1.0 - pow(1.0 - localDraw2, 2.4);

       // Incandescent molten 24k gold leading tip as lines draw around the frame
       float distToTip = max(0.0, localDraw2 - segU2);
       float tipSpark = exp(-distToTip * 26.0) * step(0.01, localDraw2) * (1.0 - smoothstep(0.94, 1.0, localDraw2));

       // Continuous diagonal ballroom light glint sweeping across the bevelled gold bars
       float diagCoord = vWorldPosDeco.x * 0.22 + vWorldPosDeco.y * 0.18;
       float sweepCenter = mod(uTime * 0.55, 4.4) - 2.2;
       float sheen = exp(-pow((diagCoord - sweepCenter) * 3.6, 2.0));

       // Fine brushed-gold micro-shimmer
       float brush = sin(vWorldPosDeco.x * 38.0 + vWorldPosDeco.y * 12.0) * 0.04 + 0.96;
       totalEmissiveRadiance *= brush;
       totalEmissiveRadiance += vec3(1.0, 0.88, 0.52) * (tipSpark * 2.2 + sheen * 0.48);`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
       gl_FragColor.a *= uOpacity;`
    );
  };

  const frameMesh = new THREE.Mesh(frameGeo, goldMat);
  root.add(frameMesh);

  return {
    chapter,
    root,
    getStats: () => currentStats,
    applyFrameStyle: (nextStyle: FrameStyle) => {
      const next = buildGeometryFor(nextStyle);
      const previous = frameMesh.geometry;
      frameMesh.geometry = buildFrameBufferGeometry(next.specs);
      previous.dispose();
      currentStats = next.stats;
    },
    updateState: ({ drawProgress, textProgress, partOpen, opacity, time }) => {
      root.visible = opacity > 0.01;
      if (!root.visible) return;

      frameUniforms.uDraw.value = THREE.MathUtils.clamp(drawProgress, 0, 1);
      frameUniforms.uPartOpen.value = THREE.MathUtils.clamp(partOpen, 0, 1);
      frameUniforms.uOpacity.value = THREE.MathUtils.clamp(opacity, 0, 1);
      frameUniforms.uTime.value = time;

      for (const rig of textRigs) {
        // Subtle Z-settle as typography reveals
        rig.setReveal(textProgress, time, opacity * (1.0 - partOpen * 0.85));
      }
    },
    dispose: () => {
      frameMesh.geometry.dispose();
      goldMat.dispose();
      for (const rig of textRigs) {
        rig.dispose();
      }
    },
  };
}

