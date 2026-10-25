import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, cinemaCameraZ, clamp01 } from '../scene/choreography';
import { orbitFocus } from '../scene/orbitFocus';
import { getCinemaCameraPose } from '../scene/responsiveLayout';
import type { PremiereStore } from './premiereStore';
import { usePointerAim } from './usePointerAim';
import { usePremiereStore, usePremiereStoreApi } from './usePremiereStore';
import { useViewportFit } from './useViewportFit';

/** The manager's focusOrbitOnChapter, side effects included. */
function focusOrbitCamera(store: PremiereStore, camera: THREE.Camera, controls: OrbitControlsImpl) {
  const state = store.getState();
  const chapterIndex = activeChapterIndex(state.currentTime, SEQUENCE_CHAPTERS);
  const focus = orbitFocus(SEQUENCE_CHAPTERS[chapterIndex], state.currentTime);
  if (focus.holdAt !== null) {
    state.setTime(focus.holdAt);
    state.setPlaying(false);
  }
  controls.target.set(...focus.target);
  camera.position.set(...focus.cameraPosition);
  controls.update();
}

/**
 * The theatrical z-fly-through (ADDENDUM-022 §2.3). Cinema mode runs
 * the manager's exact pose math — cinemaCameraZ + getCinemaCameraPose +
 * lookAt(z − 11) + roll. OrbitControls mount only in orbit mode, where
 * the manager enabled them, so an idle controls.update() can never
 * fight the dolly; the focus effect replays focusOrbitOnChapter on
 * every orbitFocusSerial bump (orbit entry and chapter jumps).
 */
export function CinemaCamera() {
  const store = usePremiereStoreApi();
  const cameraMode = usePremiereStore((state) => state.cameraMode);
  const focusSerial = usePremiereStore((state) => state.orbitFocusSerial);
  const camera = useThree((state) => state.camera);
  const pointer = usePointerAim();
  const fit = useViewportFit();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    if (cameraMode === 'cinema') camera.up.set(0, 1, 0);
  }, [camera, cameraMode]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (cameraMode === 'orbit' && controls) focusOrbitCamera(store, camera, controls);
  }, [store, camera, cameraMode, focusSerial]);

  useFrame(({ clock }) => {
    const state = store.getState();
    if (state.cameraMode !== 'cinema') return;
    const t = state.currentTime;
    const activeIdx = activeChapterIndex(t, SEQUENCE_CHAPTERS);
    const activeCh = SEQUENCE_CHAPTERS[activeIdx];
    const chLocal = clamp01((t - activeCh.startTime) / (activeCh.endTime - activeCh.startTime));
    const targetZ = cinemaCameraZ({
      chapters: SEQUENCE_CHAPTERS,
      activeIdx,
      chapterLocal: chLocal,
      pullback: fit.cameraPullback,
    });
    const pose = getCinemaCameraPose(fit, pointer.current, state.freezeAt ?? clock.elapsedTime);
    camera.position.set(pose.x, pose.y, targetZ);
    camera.lookAt(pose.targetX, pose.targetY, targetZ - 11.0);
    camera.rotation.z = pose.roll;
  });

  if (cameraMode !== 'orbit') return null;
  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.06}
      minDistance={3.2}
      maxDistance={26}
    />
  );
}
