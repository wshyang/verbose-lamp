import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, lightRig, rigAnchors } from '../scene/choreography';
import type { PremiereStore } from './premiereStore';

/**
 * The theatrical moving rig (ADDENDUM-022 §6 step 2.3): a warm ambient wash and three
 * point lights that travel with the active card, so the bevelled gold bars gleam as the
 * camera flies. Positions all come from `lightRig()`.
 */
export function LightingRig({ store }: { store: PremiereStore }) {
  const camera = useThree((state) => state.camera);
  const key = useRef<THREE.PointLight>(null);
  const rim = useRef<THREE.PointLight>(null);
  const cool = useRef<THREE.PointLight>(null);

  useFrame(() => {
    const { currentTime, cameraMode } = store.getState();
    const activeIndex = activeChapterIndex(currentTime, SEQUENCE_CHAPTERS);
    const anchors = rigAnchors({
      cameraMode,
      cameraZ: camera.position.z,
      chapterZ: SEQUENCE_CHAPTERS[activeIndex].zPosition,
    });
    const rig = lightRig(store.getState().elapsed, anchors.lightZ);
    key.current?.position.set(...rig.key);
    rim.current?.position.set(...rig.rim);
    cool.current?.position.set(...rig.cool);
  });

  return (
    <>
      <ambientLight color="#ffe8b3" intensity={0.35} />
      <pointLight ref={key} name="rig-key" color="#ffdf91" intensity={28} distance={32} decay={1.5} />
      <pointLight ref={rim} name="rig-rim" color="#f5a623" intensity={22} distance={30} decay={1.5} />
      <pointLight ref={cool} name="rig-cool" color="#7da9e8" intensity={11} distance={28} decay={1.6} />
    </>
  );
}
