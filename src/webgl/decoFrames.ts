import * as THREE from 'three';
import { createExtrudedDecoTextMesh, DecoTextRig } from './decoTypography';
import { HeroTitleConfig, SequenceChapter } from '../types/sequence';
import { DEFAULT_FRAME_STYLE, FrameStyle, PolylineSpec } from './frameGrammar/types';
import { buildFrame } from './frameGrammar';
import { createGoldFrameMaterial, createGoldFrameUniforms } from './frameMaterial';


interface GeometryAccumulator {
  positions: number[];
  normals: number[];
  pathData: number[]; // x: normalized u (0..1), y: delay (0..0.7), z: partSide (-1..+1)
  indices: number[];
}

/**
 * Appends a 3D chamfered 24k gold bar along a 2D polyline at plane `z`.
 * Cross-section has a flat gleaming crest + two 45-degree angled bevel facets + side walls
 * with clean mitered corner joins so light catches every 45° and 90° Art Deco turn.
 */
function appendChamferedPolyline(acc: GeometryAccumulator, spec: PolylineSpec) {
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

/** Shared rail extrusion for title cards and camera-attached poster borders. */
export function createChamferedFrameGeometry(specs: PolylineSpec[]): THREE.BufferGeometry {
  const acc: GeometryAccumulator = { positions: [], normals: [], pathData: [], indices: [] };
  for (const spec of specs) appendChamferedPolyline(acc, spec);
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
  /** Rebuilds only the gold frame geometry; typography and material are untouched. */
  setFrameStyle: (style: FrameStyle) => void;
  updateState: (params: {
    drawProgress: number; // 0..1 golden frame trim-path draw
    textProgress: number; // 0..1 typography reveal
    partOpen: number;     // 0..1 theatrical gate parting as camera flies through
    opacity: number;      // 0..1 master fade
    time: number;
  }) => void;
  dispose: () => void;
}

/**
 * Builds a complete 3D Title Card Assembly (Multi-Plane Golden Frame + Extruded Deco Typography)
 */
/** Pure spec → GPU geometry. Kept separate so intricacy changes never touch typography. */
function buildFrameGeometry(
  archetype: SequenceChapter['archetype'],
  mainTextWidth: number,
  style: FrameStyle
): THREE.BufferGeometry {
  const request = { archetype, mainWidth: mainTextWidth, ...style };
  return createChamferedFrameGeometry(buildFrame(request));
}

export interface GatsbyCardOptions {
  heroOverride?: HeroTitleConfig;
  style?: FrameStyle;
}

export function createGatsbyCardRig(
  chapter: SequenceChapter,
  options: GatsbyCardOptions = {}
): GatsbyCardRig {
  const heroOverride = options.heroOverride;
  const root = new THREE.Group();
  root.position.z = chapter.zPosition;

  const isHero = chapter.archetype === 'gatsby_hero';
  const isMonogram = chapter.archetype === 'monogram_gate';

  const topStr = isHero
    ? (heroOverride?.keystone ?? chapter.topLine ?? 'THE')
    : (chapter.topLine ?? '');
  const midStr = isHero
    ? (heroOverride?.preTitle ?? chapter.middleLine ?? 'GREAT')
    : (chapter.middleLine ?? '');
  const mainStr = isHero
    ? (heroOverride?.mainTitle ?? chapter.mainLine ?? 'GATSBY')
    : chapter.mainLine;
  const botStr = isHero
    ? (heroOverride?.subCredit ?? chapter.bottomLine ?? '')
    : (chapter.bottomLine ?? '');
  const useAlternation = isHero
    ? (heroOverride?.pinstripeAlternation ?? true)
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

  // Build Multi-Plane 3D Chamfered Gold Frame Geometry (swappable: see setFrameStyle)
  let frameStyle: FrameStyle = options.style ?? DEFAULT_FRAME_STYLE;
  let frameGeo = buildFrameGeometry(chapter.archetype, mainTextWidth, frameStyle);

  const frameUniforms = createGoldFrameUniforms();
  const goldMat = createGoldFrameMaterial(frameUniforms);

  const frameMesh = new THREE.Mesh(frameGeo, goldMat);
  root.add(frameMesh);

  const setFrameStyle = (next: FrameStyle) => {
    const sameStyle =
      Math.abs(next.intricacy - frameStyle.intricacy) < 1e-6 &&
      JSON.stringify(next.formula) === JSON.stringify(frameStyle.formula);
    if (sameStyle) return;
    frameStyle = {
      intricacy: next.intricacy,
      formula: {
        ...next.formula,
        genome: { ...next.formula.genome },
        layers: next.formula.layers?.map((layer) => ({ ...layer })),
      },
    };
    const previous = frameGeo;
    frameGeo = buildFrameGeometry(chapter.archetype, mainTextWidth, frameStyle);
    frameMesh.geometry = frameGeo;
    previous.dispose();
  };

  return {
    chapter,
    root,
    setFrameStyle,
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
      frameGeo.dispose();
      goldMat.dispose();
      for (const rig of textRigs) {
        rig.dispose();
      }
    },
  };
}
