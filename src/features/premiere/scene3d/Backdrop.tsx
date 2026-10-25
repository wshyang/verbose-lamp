import { useRef } from 'react';
import type * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, rigAnchors } from '../scene/choreography';
import { DecoWall } from './DecoWall';
import type { PremiereStoreApi } from './premiereStore';
import { Searchlights } from './Searchlights';

/**
 * The manager's backdrop group (ADDENDUM-022 §2.3), from PR #5: the wallpaper and the
 * searchlights ride together at `rigAnchors().backdropZ`, so the ballroom wall always sits
 * behind the active card. It mounts after the camera so the anchor reads this frame's Z.
 */
export function Backdrop({ store }: { store: PremiereStoreApi }) {
  const camera = useThree((state) => state.camera);
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!group.current) return;
    const { currentTime, cameraMode } = store.getState();
    const chapter = SEQUENCE_CHAPTERS[activeChapterIndex(currentTime, SEQUENCE_CHAPTERS)];
    group.current.position.z = rigAnchors({
      cameraMode,
      cameraZ: camera.position.z,
      chapterZ: chapter.zPosition,
    }).backdropZ;
  });

  return (
    <group ref={group} name="backdrop">
      <DecoWall />
      <Searchlights store={store} />
    </group>
  );
}
