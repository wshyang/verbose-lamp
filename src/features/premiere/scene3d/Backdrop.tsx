import { useRef } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, rigAnchors } from '../scene/choreography';
import { DecoWall } from './DecoWall';
import { Searchlights } from './Searchlights';
import { usePremiereStoreApi } from './usePremiereStore';

/**
 * The manager's backdropGroup (ADDENDUM-022 §2.3): wallpaper and
 * searchlights riding at `rigAnchors().backdropZ`, so the ballroom wall
 * always sits behind the active card. Mounts after CinemaCamera in
 * PremiereScene so the anchors read this frame's camera z.
 */
export function Backdrop() {
  const store = usePremiereStoreApi();
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    if (!groupRef.current) return;
    const { currentTime, cameraMode } = store.getState();
    const chapterIndex = activeChapterIndex(currentTime, SEQUENCE_CHAPTERS);
    const anchors = rigAnchors({
      cameraMode,
      cameraZ: camera.position.z,
      chapterZ: SEQUENCE_CHAPTERS[chapterIndex].zPosition,
    });
    groupRef.current.position.z = anchors.backdropZ;
  });

  return (
    <group ref={groupRef}>
      <DecoWall />
      <Searchlights />
    </group>
  );
}
