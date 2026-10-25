import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, lightRig, rigAnchors } from '../scene/choreography';
import type { PremiereStore } from './premiereStore';

export interface LightingRigProps {
  store: PremiereStore;
}

/** Ambient champagne wash plus the three orbiting point lights (ADDENDUM-022 §6.3). */
export function LightingRig({ store }: LightingRigProps) {
  const key = useRef<THREE.PointLight>(null);
  const rim = useRef<THREE.PointLight>(null);
  const cool = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const scene = store.getState();
    const chapter = SEQUENCE_CHAPTERS[activeChapterIndex(scene.currentTime, SEQUENCE_CHAPTERS)];
    const anchors = rigAnchors({
      cameraMode: scene.cameraMode,
      cameraZ: state.camera.position.z,
      chapterZ: chapter.zPosition,
    });
    const rig = lightRig(scene.freezeAt ?? state.clock.elapsedTime, anchors.lightZ);
    key.current?.position.set(...rig.key);
    rim.current?.position.set(...rig.rim);
    cool.current?.position.set(...rig.cool);
  });

  return (
    <>
      <ambientLight color="#ffe8b3" intensity={0.35} />
      <pointLight ref={key} color="#ffdf91" intensity={28} distance={32} decay={1.5} />
      <pointLight ref={rim} color="#f5a623" intensity={22} distance={30} decay={1.5} />
      <pointLight ref={cool} color="#7da9e8" intensity={11} distance={28} decay={1.6} />
    </>
  );
}
