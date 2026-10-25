import * as THREE from 'three';
import {
  buildFrame,
  createChamferedFrameGeometry,
  createExtrudedDecoTextMesh,
  createGoldFrameMaterial,
  createGoldFrameUniforms,
  DEFAULT_FRAME_STYLE,
  type DecoTextRig,
  type FrameStyle,
} from '@/features/art-deco-frame';
import type { HeroTitleConfig, SequenceChapter } from '../model/types';

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
      // In front of the keystone plate's crest (z 0.14): at 0.16 the letters'
      // back half sat inside the plate's extrusion and the rails cut through them.
      topRig.group.position.set(0, isHero ? 2.48 : 1.18, 0.24);
      root.add(topRig.group);
      textRigs.push(topRig);
    }

    if (botStr.trim()) {
      const botRig = createExtrudedDecoTextMesh({
        text: botStr,
        worldHeight: isHero ? 0.18 : 0.25,
        extrudeDepth: 0.05,
        finish: 'pure-gold',
        alternatePinstripes: false,
        tracking: 0.34,
        weight: 'fine',
      });
      // The credit belongs in the lower pediment's one clear band: below the
      // diamond (bottom -1.64) and above the inner frame's bottom rail (-1.90).
      // At -2.62 it sat on the fan, with the rays crossing the words.
      botRig.group.position.set(0, isHero ? -1.77 : -1.18, 0.22);
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
