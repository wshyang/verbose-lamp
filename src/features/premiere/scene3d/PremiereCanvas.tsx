import { Canvas, type RootState } from '@react-three/fiber';
import * as THREE from 'three';
import { PremiereScene, type SceneCallbacks } from './PremiereScene';
import type { PremiereStoreApi } from './premiereStore';

/**
 * The renderer look, applied once. Everything here matches the imperative
 * renderer value for value; `scene.add(camera)` is required because the screen
 * border is parented to the camera and R3F's default camera is not in the graph.
 */
export function applyRendererLook({ gl, scene, camera }: RootState): void {
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.18;
  scene.background = new THREE.Color('#050407');
  scene.fog = new THREE.FogExp2('#050407', 0.022);
  scene.add(camera);
}

interface PremiereCanvasProps extends SceneCallbacks {
  store: PremiereStoreApi;
}

/** The WebGL surface. React owns the lifecycle of everything inside it. */
export function PremiereCanvas({ store, ...callbacks }: PremiereCanvasProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 42, near: 0.1, far: 180, position: [0, 0, 10.5] }}
      onCreated={applyRendererLook}
      style={{ position: 'absolute', inset: 0 }}
    >
      <PremiereScene store={store} {...callbacks} />
    </Canvas>
  );
}
