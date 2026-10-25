import * as THREE from 'three';
import {
  DEFAULT_SCREEN_BORDER_SEED,
  buildEdgeBorder,
  viewportScaleAtDistance,
  type ScreenBorderPattern,
  type ScreenBorderStyle,
} from '../engine/frameGrammar';
import { clampGenome } from '../engine/frameGrammar/genome';
import { createChamferedFrameGeometry } from './railGeometry';
import { createGoldFrameMaterial, createGoldFrameUniforms, type FrameFinish } from './frameMaterial';

export interface ScreenBorderRig {
  root: THREE.Group;
  setStyle: (style: ScreenBorderStyle) => void;
  setEnabled: (enabled: boolean) => void;
  setViewport: (aspect: number) => void;
  update: (time: number) => void;
  dispose: () => void;
}

const DISTANCE = 3;
/** Finish per pattern, exported for the tests and for hosts that pre-warm programs. */
export function finishFor(pattern: ScreenBorderPattern): FrameFinish {
  return pattern === 'lattice' ? 'brass' : 'gold';
}

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

  const normalise = (next: ScreenBorderStyle): Required<ScreenBorderStyle> => ({
    weight: THREE.MathUtils.clamp(next.weight, 0, 1),
    genome: clampGenome(next.genome),
    pattern: next.pattern ?? 'poster',
    seed: next.seed ?? DEFAULT_SCREEN_BORDER_SEED,
  });
  const sameStyle = (a: Required<ScreenBorderStyle>, b: Required<ScreenBorderStyle>) =>
    a.weight === b.weight &&
    a.pattern === b.pattern &&
    a.seed === b.seed &&
    JSON.stringify(a.genome) === JSON.stringify(b.genome);

  let style = normalise(initialStyle);
  let aspectRatio = aspect;
  const uniforms = createGoldFrameUniforms(1, 1);
  /** The lattice proscenium is brass; the printed poster edge stays 24k gold. */
  let finish = finishFor(style.pattern);
  let material = createGoldFrameMaterial(uniforms, { finish });
  material.depthTest = false;
  material.depthWrite = false;

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
      const normalised = normalise(next);
      if (sameStyle(normalised, style)) return;
      style = normalised;
      rebuild();
      const nextFinish = finishFor(style.pattern);
      if (nextFinish !== finish) {
        finish = nextFinish;
        const previous = material;
        material = createGoldFrameMaterial(uniforms, { finish });
        material.depthTest = false;
        material.depthWrite = false;
        mesh.material = material;
        previous.dispose();
      }
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
