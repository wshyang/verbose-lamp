import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, rigAnchors } from '../scene/choreography';
import { DecoWall } from './DecoWall';
import { GoldDust } from './GoldDust';
import { GreenLight } from './GreenLight';
import type { PremiereStore } from './premiereStore';
import { Searchlights } from './Searchlights';

interface AtmosphereProps {
  store: PremiereStore;
}

/** Backdrop group that tracks the camera/active chamber, plus dust and green light. */
export function Atmosphere({ store }: AtmosphereProps) {
  const backdropRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    // The backdrop group below is always mounted when frames run.
    const backdrop = backdropRef.current as THREE.Group;
    const premiere = store.getState();
    const activeIndex = activeChapterIndex({
      time: premiere.currentTime,
      chapters: SEQUENCE_CHAPTERS,
    });
    const anchors = rigAnchors({
      cameraMode: premiere.cameraMode,
      cameraZ: state.camera.position.z,
      chapterZ: SEQUENCE_CHAPTERS[activeIndex].zPosition,
    });
    backdrop.position.z = anchors.backdropZ;
  });

  return (
    <>
      <group ref={backdropRef}>
        <DecoWall />
        <Searchlights store={store} />
      </group>
      <GreenLight store={store} />
      <GoldDust store={store} />
    </>
  );
}
