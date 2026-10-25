import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from 'zustand';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, cinemaCameraZ } from '../scene/choreography';
import { orbitFocusPlan } from '../scene/orbitFocus';
import { getCinemaCameraPose, type ViewportFit } from '../scene/responsiveLayout';
import { usePointerAim, stepToward } from './usePointerAim';
import type { PremiereStore } from './premiereStore';

interface CinemaCameraProps {
  store: PremiereStore;
  fit: ViewportFit;
}

/**
 * The camera (ADDENDUM-022 §6 step 2.3).
 *
 * Cinema mode is the film: `cinemaCameraZ` pushes through each act and
 * `getCinemaCameraPose` adds the drift, the pointer lean and the roll. Orbit mode hands
 * the camera to `OrbitControls`, focused through `orbitFocusPlan` — the exact rule the
 * manager used, now testable without a canvas.
 */
export function CinemaCamera({ store, fit }: CinemaCameraProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const frozen = useStore(store, (state) => state.freezeAt !== null);
  const pointerTarget = usePointerAim(frozen);
  const smooth = useRef(new THREE.Vector2(0, 0));

  const controls = useRef<OrbitControls | null>(null);
  const cameraMode = useStore(store, (state) => state.cameraMode);
  const focusNonce = useStore(store, (state) => state.orbitFocusNonce);

  // OrbitControls are created once and enabled only in orbit mode; the manager did the
  // same, which keeps their damping state across a mode switch.
  useEffect(() => {
    const instance = new OrbitControls(camera as THREE.PerspectiveCamera, gl.domElement);
    instance.enableDamping = true;
    instance.dampingFactor = 0.06;
    instance.minDistance = 3.2;
    instance.maxDistance = 26;
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

  // Every orbit hand-off re-frames the act that is on screen, even a repeat request.
  useEffect(() => {
    const instance = controls.current;
    if (!instance || cameraMode !== 'orbit') return;
    const { currentTime, orbitTargetChapter, setTime, setPlaying } = store.getState();
    const chapter = SEQUENCE_CHAPTERS[orbitTargetChapter] ?? SEQUENCE_CHAPTERS[0];
    const plan = orbitFocusPlan(currentTime, chapter);
    if (plan.time !== null) {
      setTime(plan.time);
      setPlaying(false);
    }
    instance.target.set(...plan.target);
    camera.position.set(...plan.position);
    instance.update();
  }, [camera, cameraMode, focusNonce, store]);

  useFrame((_state, delta) => {
    const { currentTime, cameraMode: mode } = store.getState();
    const activeIndex = activeChapterIndex(currentTime, SEQUENCE_CHAPTERS);
    const chapter = SEQUENCE_CHAPTERS[activeIndex];

    if (mode === 'orbit') {
      controls.current?.update();
      return;
    }

    const local = Math.min(
      1,
      Math.max(0, (currentTime - chapter.startTime) / (chapter.endTime - chapter.startTime))
    );
    const targetZ = cinemaCameraZ({
      chapters: SEQUENCE_CHAPTERS,
      activeIdx: activeIndex,
      chapterLocal: local,
      pullback: fit.cameraPullback,
    });

    const next = stepToward(
      { x: smooth.current.x, y: smooth.current.y },
      { x: pointerTarget.current.x, y: pointerTarget.current.y },
      delta
    );
    smooth.current.set(next.x, next.y);

    const pose = getCinemaCameraPose(fit, smooth.current, store.getState().elapsed);
    camera.position.set(pose.x, pose.y, targetZ);
    camera.lookAt(pose.targetX, pose.targetY, targetZ - 11.0);
    camera.rotation.z = pose.roll;
  });

  return null;
}
