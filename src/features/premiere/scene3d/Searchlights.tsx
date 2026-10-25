import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, rigAnchors, searchlightSway } from '../scene/choreography';
import { createSearchlightTexture } from '../scene/searchlightTexture';
import type { PremiereStore } from './premiereStore';

export interface SearchlightsProps {
  store: PremiereStore;
}

/** The two sweeping premiere searchlight cones behind the gates (ADDENDUM-022 §6.3). */
export function Searchlights({ store }: SearchlightsProps) {
  const group = useRef<THREE.Group>(null!);
  const left = useRef<THREE.Mesh>(null!);
  const right = useRef<THREE.Mesh>(null!);
  const texture = useMemo(() => createSearchlightTexture(), []);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state) => {
    const scene = store.getState();
    const chapter = SEQUENCE_CHAPTERS[activeChapterIndex(scene.currentTime, SEQUENCE_CHAPTERS)];
    const anchors = rigAnchors({
      cameraMode: scene.cameraMode,
      cameraZ: state.camera.position.z,
      chapterZ: chapter.zPosition,
    });
    group.current.position.z = anchors.backdropZ;

    const sway = searchlightSway(scene.freezeAt ?? state.clock.elapsedTime);
    left.current.rotation.z = sway.left;
    right.current.rotation.z = sway.right;
  });

  return (
    <group ref={group}>
      <mesh ref={left} position={[-6.5, -4, -9.5]} rotation={[0, 0, -0.38]}>
        <planeGeometry args={[7.5, 26]} />
        <meshBasicMaterial
          map={texture}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={right} position={[6.5, -4, -9.5]} rotation={[0, 0, 0.38]}>
        <planeGeometry args={[7.5, 26]} />
        <meshBasicMaterial
          map={texture}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
