import { useEffect, useRef, type ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStore } from 'zustand';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import {
  activeChapterIndex,
  chapterProgress,
  cinemaCameraZ,
  smoothPointer,
} from '../scene/choreography';
import { orbitFocusFor } from '../scene/orbitFocus';
import { getCinemaCameraPose, type ViewportFit } from '../scene/responsiveLayout';
import type { PremiereStore } from './premiereStore';
import { sceneElapsed } from './sceneElapsed';
import { usePointerAim } from './usePointerAim';

interface CinemaCameraProps {
  store: PremiereStore;
  viewportFit: ViewportFit;
}

type OrbitControlsHandle = ComponentRef<typeof OrbitControls>;

/** Directed cinema fly-through, or Drei orbit inspection focused on the active card. */
export function CinemaCamera({ store, viewportFit }: CinemaCameraProps) {
  const camera = useThree((state) => state.camera);
  const cameraMode = useStore(store, (state) => state.cameraMode);
  const activeIndex = useStore(store, (state) =>
    activeChapterIndex({ time: state.currentTime, chapters: SEQUENCE_CHAPTERS })
  );
  const controlsRef = useRef<OrbitControlsHandle>(null);
  const pointerTarget = usePointerAim(store);
  const pointerSmoothRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (cameraMode === 'cinema') {
      camera.up.set(0, 1, 0);
      return;
    }
    const state = store.getState();
    const chapter = SEQUENCE_CHAPTERS[activeIndex];
    const focus = orbitFocusFor({ chapter, currentTime: state.currentTime });
    camera.position.set(...focus.cameraPosition);
    controlsRef.current?.target.set(...focus.target);
    controlsRef.current?.update();
  }, [activeIndex, camera, cameraMode, store]);

  useFrame((state, delta) => {
    const premiere = store.getState();
    if (premiere.cameraMode !== 'cinema') return;
    const index = activeChapterIndex({
      time: premiere.currentTime,
      chapters: SEQUENCE_CHAPTERS,
    });
    const chapter = SEQUENCE_CHAPTERS[index];
    const local = chapterProgress({ time: premiere.currentTime, chapter });
    const chapterLocal = Math.min(1, Math.max(0, local));
    const targetZ = cinemaCameraZ({
      chapters: SEQUENCE_CHAPTERS,
      activeIndex: index,
      chapterLocal,
      pullback: viewportFit.cameraPullback,
    });
    pointerSmoothRef.current = smoothPointer({
      current: pointerSmoothRef.current,
      target: pointerTarget.current,
      dt: premiere.freezeAt === null ? delta : 0,
    });
    const pose = getCinemaCameraPose(
      viewportFit,
      pointerSmoothRef.current,
      sceneElapsed(store, state)
    );
    camera.position.set(pose.x, pose.y, targetZ);
    camera.lookAt(pose.targetX, pose.targetY, targetZ - 11.0);
    camera.rotation.z = pose.roll;
  });

  if (cameraMode !== 'orbit') return null;
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault={false}
      enableDamping
      dampingFactor={0.06}
      minDistance={3.2}
      maxDistance={26}
    />
  );
}
