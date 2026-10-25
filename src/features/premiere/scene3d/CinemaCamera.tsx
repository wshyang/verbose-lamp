import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import {
  activeChapterIndex,
  cinemaCameraZ,
  clamp,
} from '../scene/choreography';
import { getCinemaCameraPose, type ViewportFit } from '../scene/responsiveLayout';
import { orbitPose } from './orbitFocus';
import { usePremiereStore, type PremiereStoreApi } from './premiereStore';

/** Pointer aim smoothing, identical to the imperative renderer's lerp factor. */
export const POINTER_LERP_PER_SECOND = 4.5;

/** Window pointer aim, ignored entirely while the frame is frozen. */
function usePointerAim(store: PremiereStoreApi) {
  const smooth = useRef(new THREE.Vector2(0, 0));
  const target = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (store.getState().freezeAt !== null) return;
      target.current.set(
        (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1,
        -((event.clientY / Math.max(1, window.innerHeight)) * 2 - 1)
      );
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [store]);

  return { smooth, target };
}

interface CinemaCameraProps {
  store: PremiereStoreApi;
  fit: ViewportFit;
}

/**
 * Directed fly-through in cinema mode; drei's OrbitControls — the same
 * `three-stdlib` controls, so the feel is unchanged — in orbit mode.
 */
export function CinemaCamera({ store, fit }: CinemaCameraProps) {
  const camera = useThree((state) => state.camera);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const { smooth, target } = usePointerAim(store);
  const cameraMode = usePremiereStore(store, (state) => state.cameraMode);
  const focus = usePremiereStore(store, (state) => state.orbitFocus);

  useEffect(() => {
    if (cameraMode !== 'orbit') {
      camera.up.set(0, 1, 0);
      return;
    }
    if (!focus || !controls.current) return;
    const pose = orbitPose(SEQUENCE_CHAPTERS[focus.chapterIndex]);
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    controls.current.target.set(pose.target[0], pose.target[1], pose.target[2]);
    controls.current.update();
  }, [camera, cameraMode, focus]);

  useFrame((_, delta) => {
    if (cameraMode === 'orbit') return;
    const scene = store.getState();
    smooth.current.lerp(target.current, Math.min(1, Math.min(0.05, delta) * POINTER_LERP_PER_SECOND));

    const t = scene.currentTime;
    const activeIdx = activeChapterIndex(t, SEQUENCE_CHAPTERS);
    const chapter = SEQUENCE_CHAPTERS[activeIdx];
    const local = clamp((t - chapter.startTime) / (chapter.endTime - chapter.startTime), 0, 1);
    const z = cinemaCameraZ({
      chapters: SEQUENCE_CHAPTERS,
      activeIdx,
      chapterLocal: local,
      pullback: fit.cameraPullback,
    });
    const pose = getCinemaCameraPose(fit, smooth.current, scene.elapsed);
    camera.position.set(pose.x, pose.y, z);
    camera.lookAt(pose.targetX, pose.targetY, z - 11.0);
    camera.rotation.z = pose.roll;
  });

  if (cameraMode !== 'orbit') return null;
  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.06}
      minDistance={3.2}
      maxDistance={26}
    />
  );
}
