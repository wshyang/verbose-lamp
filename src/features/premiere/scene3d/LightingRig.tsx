import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, lightRig, rigAnchors } from '../scene/choreography';
import type { PremiereStore } from './premiereStore';
import { sceneElapsed } from './sceneElapsed';

interface LightingRigProps {
  store: PremiereStore;
}

/** Ambient wash plus the three moving theatrical point lights. */
export function LightingRig({ store }: LightingRigProps) {
  const keyRef = useRef<THREE.PointLight>(null);
  const rimRef = useRef<THREE.PointLight>(null);
  const coolRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
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
    const positions = lightRig({
      elapsed: sceneElapsed(store, state),
      focusZ: anchors.lightZ,
    });
    keyRef.current?.position.set(...positions.key);
    rimRef.current?.position.set(...positions.rim);
    coolRef.current?.position.set(...positions.cool);
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
