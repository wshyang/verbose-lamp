import * as THREE from 'three';
import { Canvas, type RootState } from '@react-three/fiber';
import type { PlaybackTelemetry } from '../scene/sceneApi';
import type { PremiereStore } from './premiereStore';
import { PremiereScene } from './PremiereScene';
import { PremiereStoreContext } from './usePremiereStore';

interface PremiereCanvasProps {
  store: PremiereStore;
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (index: number) => void;
  onFrameReady: () => void;
}

/** The renderer/scene one-offs the manager's constructor applied. */
function applyRendererLook({ gl, scene, camera }: RootState) {
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.18;
  scene.background = new THREE.Color('#050407');
  scene.fog = new THREE.FogExp2('#050407', 0.022);
  // Keep the camera in the scene graph so its camera-local poster border renders.
  scene.add(camera);
}

/**
 * The R3F stage root (ADDENDUM-022 §2.2): canvas configuration copied
 * from the imperative renderer — clamped dpr, high-performance opaque
 * context, the 42° camera at z 10.5. The vanilla store rides context
 * so every scene component shares the one the HUD drives.
 */
export function PremiereCanvas({
  store,
  onTelemetry,
  onChapterChange,
  onFrameReady,
}: PremiereCanvasProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 42, near: 0.1, far: 180, position: [0, 0, 10.5] }}
      onCreated={applyRendererLook}
    >
      <PremiereStoreContext.Provider value={store}>
        <PremiereScene
          onTelemetry={onTelemetry}
          onChapterChange={onChapterChange}
          onFrameReady={onFrameReady}
        />
      </PremiereStoreContext.Provider>
    </Canvas>
  );
}
