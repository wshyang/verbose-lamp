import * as THREE from 'three';
import { PosterBorderStyle } from './frameGrammar';
import { buildPosterBorderSpecs } from './frameGrammar/posterBorder';
import { createChamferedFrameGeometry } from './decoFrames';
import { createGoldFrameMaterial, createGoldFrameUniforms } from './frameMaterial';

export interface PosterBorderRig {
  root: THREE.Group;
  setStyle: (style: PosterBorderStyle) => void;
  setEnabled: (enabled: boolean) => void;
  setViewport: () => void;
  update: (time: number) => void;
  dispose: () => void;
}

function clampStyle(style: PosterBorderStyle): PosterBorderStyle {
  return {
    level: THREE.MathUtils.clamp(Math.round(style.level), 1, 4),
    intricacy: THREE.MathUtils.clamp(style.intricacy, 0, 1),
  };
}

function makeMaterial() {
  const uniforms = createGoldFrameUniforms(1, 1);
  const material = createGoldFrameMaterial(uniforms);
  material.depthTest = false;
  material.depthWrite = false;
  material.envMapIntensity = 2.5;
  return { uniforms, material };
}

function makeGeometry(camera: THREE.PerspectiveCamera, style: PosterBorderStyle) {
  const distance = 2.4;
  const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const halfWidth = halfHeight * camera.aspect;
  const specs = buildPosterBorderSpecs({ halfWidth, halfHeight, style });
  return createChamferedFrameGeometry(specs);
}

export function createPosterBorderRig(
  camera: THREE.PerspectiveCamera,
  initialStyle: PosterBorderStyle
): PosterBorderRig {
  const root = new THREE.Group();
  root.position.z = -2.4;
  root.visible = false;
  camera.add(root);

  let style = clampStyle(initialStyle);
  let geometry = makeGeometry(camera, style);
  const { uniforms, material } = makeMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10000;
  root.add(mesh);

  const rebuild = () => {
    const next = makeGeometry(camera, style);
    mesh.geometry = next;
    geometry.dispose();
    geometry = next;
  };

  return {
    root,
    setStyle: (nextStyle) => {
      const next = clampStyle(nextStyle);
      if (next.level === style.level && Math.abs(next.intricacy - style.intricacy) < 1e-6) return;
      style = next;
      rebuild();
    },
    setEnabled: (enabled) => {
      root.visible = enabled;
    },
    setViewport: rebuild,
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