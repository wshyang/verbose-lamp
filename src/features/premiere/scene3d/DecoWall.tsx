import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, rigAnchors } from '../scene/choreography';
import { createDecoWallpaperTextures } from '../scene/environment';
import type { PremiereStore } from './premiereStore';

export interface DecoWallProps {
  store: PremiereStore;
}

/** The recessed Art Deco ballroom wall, hung behind the camera's chamber (ADDENDUM-022 §6.3). */
export function DecoWall({ store }: DecoWallProps) {
  const group = useRef<THREE.Group>(null!);
  const textures = useMemo(() => createDecoWallpaperTextures(), []);

  useEffect(
    () => () => {
      textures.map.dispose();
      textures.normalMap.dispose();
      textures.roughnessMap.dispose();
    },
    [textures],
  );

  useFrame((state) => {
    const scene = store.getState();
    const chapter = SEQUENCE_CHAPTERS[activeChapterIndex(scene.currentTime, SEQUENCE_CHAPTERS)];
    const anchors = rigAnchors({
      cameraMode: scene.cameraMode,
      cameraZ: state.camera.position.z,
      chapterZ: chapter.zPosition,
    });
    group.current.position.z = anchors.backdropZ;
  });

  return (
    <group ref={group}>
      <mesh position={[0, 0, -14.5]}>
        <planeGeometry args={[46, 26]} />
        <meshStandardMaterial
          map={textures.map}
          normalMap={textures.normalMap}
          normalScale={[1.6, 1.6]}
          roughnessMap={textures.roughnessMap}
          metalness={0.72}
          roughness={0.55}
          envMapIntensity={0.85}
        />
      </mesh>
    </group>
  );
}
