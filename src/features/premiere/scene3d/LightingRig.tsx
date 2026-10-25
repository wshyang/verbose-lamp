import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { lightRig, rigAnchors } from '../scene/choreography';
import type { PremiereStoreApi } from './premiereStore';

/**
 * The theatrical moving rig: warm ambient plus key, rim and cool points that orbit
 * the focused card, so the bevelled 24k bars keep gleaming (values copied verbatim
 * from the imperative renderer).
 */
export function LightingRig({ store }: { store: PremiereStoreApi }) {
  const key = useRef<THREE.PointLight>(null);
  const rim = useRef<THREE.PointLight>(null);
  const cool = useRef<THREE.PointLight>(null);
  const camera = useThree((state) => state.camera);

  useFrame(() => {
    const scene = store.getState();
    const chapter = SEQUENCE_CHAPTERS[scene.activeChapterIndex] ?? SEQUENCE_CHAPTERS[0];
    const focusZ = rigAnchors({
      cameraMode: scene.cameraMode,
      cameraZ: camera.position.z,
      chapterZ: chapter.zPosition,
    }).lightZ;
    const rig = lightRig(scene.elapsed, focusZ);
    key.current?.position.set(rig.key[0], rig.key[1], rig.key[2]);
    rim.current?.position.set(rig.rim[0], rig.rim[1], rig.rim[2]);
    cool.current?.position.set(rig.cool[0], rig.cool[1], rig.cool[2]);
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
