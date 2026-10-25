import { useRef } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, lightRig, rigAnchors } from '../scene/choreography';
import { usePremiereStoreApi } from './usePremiereStore';

/**
 * The theatrical moving lighting rig (ADDENDUM-022 §2.3): ambient wash
 * plus key/rim/cool points repositioned every frame by the pure
 * lightRig() around the anchors' lightZ, so the bevelled gold gleams
 * dynamically — light values copied from the manager's constructor.
 * Mounts after CinemaCamera so the anchors read this frame's camera z.
 */
export function LightingRig() {
  const store = usePremiereStoreApi();
  const keyRef = useRef<THREE.PointLight>(null);
  const rimRef = useRef<THREE.PointLight>(null);
  const coolRef = useRef<THREE.PointLight>(null);

  useFrame(({ camera, clock }) => {
    if (!keyRef.current || !rimRef.current || !coolRef.current) return;
    const { currentTime, cameraMode, freezeAt } = store.getState();
    const chapterIndex = activeChapterIndex(currentTime, SEQUENCE_CHAPTERS);
    const anchors = rigAnchors({
      cameraMode,
      cameraZ: camera.position.z,
      chapterZ: SEQUENCE_CHAPTERS[chapterIndex].zPosition,
    });
    const lights = lightRig(freezeAt ?? clock.elapsedTime, anchors.lightZ);
    keyRef.current.position.set(...lights.key);
    rimRef.current.position.set(...lights.rim);
    coolRef.current.position.set(...lights.cool);
  });

  return (
    <>
      <ambientLight color="#ffe8b3" intensity={0.35} />
      <pointLight ref={keyRef} color="#ffdf91" intensity={28} distance={32} decay={1.5} />
      <pointLight ref={rimRef} color="#f5a623" intensity={22} distance={30} decay={1.5} />
      <pointLight ref={coolRef} color="#7da9e8" intensity={11} distance={28} decay={1.6} />
    </>
  );
}
