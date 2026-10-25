import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from 'zustand';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, chapterProgress, cinemaCameraZ, clamp } from '../scene/choreography';
import { orbitCameraPosition } from '../scene/orbitFocus';
import { getCinemaCameraPose, type ViewportFit } from '../scene/responsiveLayout';
import { stepToward } from './pointerAim';
import type { PremiereStoreApi } from './premiereStore';
import { usePointerAim } from './usePointerAim';

interface CinemaCameraProps {
  store: PremiereStoreApi;
  fit: ViewportFit;
}

const ORBIT_DAMPING = 0.06;
const ORBIT_MIN_DISTANCE = 3.2;
const ORBIT_MAX_DISTANCE = 26;
/** How far ahead of the camera the cinema view looks. */
const LOOK_AHEAD = 11.0;

/**
 * The premiere's camera (ADDENDUM-022 §2.3): the corridor fly-through in cinema mode, an
 * orbit view of the active card otherwise. The playhead move that entering orbit may need
 * is the store's job (`focusOrbit`); this component only reacts to the request it leaves.
 */
export function CinemaCamera({ store, fit }: CinemaCameraProps) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const isFrozen = useStore(store, (state) => state.freezeAt !== null);
  const cameraMode = useStore(store, (state) => state.cameraMode);
  const orbitFocus = useStore(store, (state) => state.orbitFocus);
  const pointer = usePointerAim(isFrozen);
  const aim = useRef({ x: 0, y: 0 });
  const controls = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const instance = new OrbitControls(camera, gl.domElement);
    instance.enableDamping = true;
    instance.dampingFactor = ORBIT_DAMPING;
    instance.minDistance = ORBIT_MIN_DISTANCE;
    instance.maxDistance = ORBIT_MAX_DISTANCE;
    instance.enabled = false;
    controls.current = instance;
    return () => {
      instance.dispose();
      controls.current = null;
    };
  }, [camera, gl]);

  useEffect(() => {
    if (controls.current) controls.current.enabled = cameraMode === 'orbit';
    if (cameraMode === 'cinema') camera.up.set(0, 1, 0);
  }, [camera, cameraMode]);

  // Each request (even to the same chapter) snaps the view onto the card's hold.
  useEffect(() => {
    const instance = controls.current;
    if (!instance || cameraMode !== 'orbit' || !orbitFocus) return;
    const chapter = SEQUENCE_CHAPTERS[orbitFocus.chapterIndex];
    const position = orbitCameraPosition(chapter);
    instance.target.set(0, 0, chapter.zPosition);
    camera.position.set(position.x, position.y, position.z);
    instance.update();
  }, [camera, cameraMode, orbitFocus]);

  useFrame((_state, delta) => {
    const { currentTime, cameraMode: mode, elapsed } = store.getState();
    if (mode === 'orbit') {
      controls.current?.update();
      return;
    }

    const index = activeChapterIndex(currentTime, SEQUENCE_CHAPTERS);
    const targetZ = cinemaCameraZ({
      chapters: SEQUENCE_CHAPTERS,
      activeIdx: index,
      chapterLocal: clamp(chapterProgress(currentTime, SEQUENCE_CHAPTERS[index]), 0, 1),
      pullback: fit.cameraPullback,
    });
    aim.current = stepToward(aim.current, pointer.current, delta);
    const pose = getCinemaCameraPose(fit, aim.current, elapsed);
    camera.position.set(pose.x, pose.y, targetZ);
    camera.lookAt(pose.targetX, pose.targetY, targetZ - LOOK_AHEAD);
    camera.rotation.z = pose.roll;
  });

  return null;
}
