import { Canvas, type RootState } from '@react-three/fiber';
import * as THREE from 'three';
import { BallroomEnvironment } from './BallroomEnvironment';
import { CinemaComposer } from './CinemaComposer';
import { PremiereScene } from './PremiereScene';
import type { PremiereStore } from './premiereStore';

/**
 * The renderer's look, matching the imperative scene exactly (ADDENDUM-022 §6.2): ACES
 * tone mapping at 1.18, near-black background and exponential fog, and — because the poster
 * border is parented to it — the camera added to the scene graph.
 */
export function applyRendererLook(state: RootState): void {
  const { gl, scene, camera } = state;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.18;
  scene.background = new THREE.Color('#050407');
  scene.fog = new THREE.FogExp2('#050407', 0.022);
  scene.add(camera);
}

export interface PremiereCanvasProps {
  store: PremiereStore;
  hasCoarsePointer?: boolean;
}

export function PremiereCanvas({ store, hasCoarsePointer = false }: PremiereCanvasProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 42, near: 0.1, far: 180, position: [0, 0, 10.5] }}
      onCreated={applyRendererLook}
    >
      <PremiereScene store={store} hasCoarsePointer={hasCoarsePointer} />
      <BallroomEnvironment />
      <CinemaComposer store={store} />
    </Canvas>
  );
}
