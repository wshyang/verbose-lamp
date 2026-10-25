import * as THREE from 'three';
import { Canvas, type RootState } from '@react-three/fiber';
import type { PremiereStore } from './premiereStore';
import { PremiereScene } from './PremiereScene';

interface PremiereCanvasProps {
  store: PremiereStore;
}

/** Renderer settings copied 1:1 from the imperative manager (ADDENDUM-022 §2.2). */
export function applyRendererLook({ camera, gl, scene }: RootState): void {
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.18;
  scene.background = new THREE.Color('#050407');
  scene.fog = new THREE.FogExp2('#050407', 0.022);
  scene.add(camera);
}

export function PremiereCanvas({ store }: PremiereCanvasProps) {
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 42, near: 0.1, far: 180, position: [0, 0, 10.5] }}
      onCreated={applyRendererLook}
    >
      <PremiereScene store={store} />
    </Canvas>
  );
}
