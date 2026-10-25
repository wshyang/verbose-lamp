import * as THREE from 'three';
import { buildEdgeBorder, viewportScaleAtDistance, type FrameFinish, type ScreenBorderStyle } from '../engine/frameGrammar';
import { clampGenome } from '../engine/frameGrammar/genome';
import { createChamferedFrameGeometry } from './railGeometry';
import { createGoldFrameMaterial, createGoldFrameUniforms } from './frameMaterial';

export interface ScreenBorderRig {
  root: THREE.Group;
  setStyle: (style: ScreenBorderStyle) => void;
  setEnabled: (enabled: boolean) => void;
  setViewport: (aspect: number) => void;
  update: (time: number) => void;
  dispose: () => void;
}

const DISTANCE = 3;

/**
 * The poster's printed edge border as a persistent proscenium, parented to the camera
 * so it stays at the viewport edge through the whole fly-through and belongs to no card.
 */
export function createScreenBorderRig(
  camera: THREE.PerspectiveCamera,
  initialStyle: ScreenBorderStyle,
  aspect: number
): ScreenBorderRig {
  const root = new THREE.Group();
  root.visible = false;
  camera.add(root);

  let style: ScreenBorderStyle = { ...initialStyle, genome: clampGenome(initialStyle.genome) };
  let aspectRatio = aspect;
  const uniforms = createGoldFrameUniforms(1, 1);
  // The lattice proscenium wears the tutorial's brass; the poster border stays gold.
  const finishFor = (s: ScreenBorderStyle): FrameFinish => (s.pattern === 'lattice' ? 'brass' : 'gold');
  const makeMaterial = (s: ScreenBorderStyle) => {
    const mat = createGoldFrameMaterial(uniforms, finishFor(s));
    mat.depthTest = false;
    mat.depthWrite = false;
    return mat;
  };
  let material = makeMaterial(style);

  const buildGeometry = () => {
    const { specs } = buildEdgeBorder({
      aspect: aspectRatio,
      genome: style.genome,
      density: style.weight,
      pattern: style.pattern,
      seed: style.seed,
    });
    return createChamferedFrameGeometry(specs);
  };

  let geometry = buildGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  root.add(mesh);

  const place = () => {
    const scale = viewportScaleAtDistance(DISTANCE, THREE.MathUtils.degToRad(camera.fov));
    root.position.set(0, 0, -DISTANCE);
    root.scale.setScalar(scale);
  };
  place();

  const rebuild = () => {
    const next = buildGeometry();
    mesh.geometry = next;
    geometry.dispose();
    geometry = next;
  };

  return {
    root,
    setStyle: (next) => {
      const genome = clampGenome(next.genome);
      const weight = THREE.MathUtils.clamp(next.weight, 0, 1);
      const isUnchanged =
        weight === style.weight &&
        next.pattern === style.pattern &&
        next.seed === style.seed &&
        JSON.stringify(genome) === JSON.stringify(style.genome);
      if (isUnchanged) return;
      const prevFinish = finishFor(style);
      style = { weight, genome, pattern: next.pattern, seed: next.seed };
      if (finishFor(style) !== prevFinish) {
        const oldMaterial = material;
        material = makeMaterial(style);
        mesh.material = material;
        oldMaterial.dispose();
      }
      rebuild();
    },
    setEnabled: (enabled) => {
      root.visible = enabled;
    },
    setViewport: (nextAspect) => {
      if (Math.abs(nextAspect - aspectRatio) < 1e-6) return;
      aspectRatio = nextAspect;
      rebuild();
      place();
    },
    update: (time) => {
      uniforms.uDraw.value = 1;
      uniforms.uPartOpen.value = 0;
      uniforms.uOpacity.value = 1;
      uniforms.uTime.value = time;
    },
    dispose: () => {
      camera.remove(root);
      geometry.dispose();
      material.dispose();
    },
  };
}
