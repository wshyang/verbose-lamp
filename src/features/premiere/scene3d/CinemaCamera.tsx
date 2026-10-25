import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';
import { useStore } from 'zustand';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, cinemaCameraZ } from '../scene/choreography';
import { planOrbitFocus } from '../scene/orbitFocus';
import { getCinemaCameraPose, type ViewportFit } from '../scene/responsiveLayout';
import { usePointerAim } from './usePointerAim';
import type { PremiereStore } from './premiereStore';

export interface CinemaCameraProps {
  store: PremiereStore;
  fit: ViewportFit;
}

/** Directed fly-through or interactive orbit (ADDENDUM-022 §6.3). */
export function CinemaCamera({ store, fit }: CinemaCameraProps) {
  const mode = useStore(store, (state) => state.cameraMode);
  return mode === 'cinema' ? <CinemaDolly store={store} fit={fit} /> : <OrbitCamera store={store} />;
}

function CinemaDolly({ store, fit }: CinemaCameraProps) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const frozen = useStore(store, (state) => state.freezeAt) !== null;
  const pointer = usePointerAim(frozen);

  useFrame((state, delta) => {
    const scene = store.getState();
    const time = scene.currentTime;
    const index = activeChapterIndex(time, SEQUENCE_CHAPTERS);
    const chapter = SEQUENCE_CHAPTERS[index];
    const local = Math.min(
      1,
      Math.max(0, (time - chapter.startTime) / (chapter.endTime - chapter.startTime)),
    );
    const targetZ = cinemaCameraZ({
      chapters: SEQUENCE_CHAPTERS,
      activeIdx: index,
      chapterLocal: local,
      pullback: fit.cameraPullback,
    });
    const pose = getCinemaCameraPose(fit, pointer.aim(delta), scene.freezeAt ?? state.clock.elapsedTime);
    camera.position.set(pose.x, pose.y, targetZ);
    camera.lookAt(pose.targetX, pose.targetY, targetZ - 11.0);
    camera.rotation.z = pose.roll;
  });

  return null;
}

function OrbitCamera({ store }: Pick<CinemaCameraProps, 'store'>) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const controls = useRef<OrbitControls | null>(null);

  const plan = useMemo(() => {
    const time = store.getState().currentTime;
    return planOrbitFocus(SEQUENCE_CHAPTERS, activeChapterIndex(time, SEQUENCE_CHAPTERS), time);
  }, [store]);

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.06;
    orbit.minDistance = 3.2;
    orbit.maxDistance = 26;
    orbit.target.set(plan.target[0], plan.target[1], plan.target[2]);
    camera.position.set(plan.camera[0], plan.camera[1], plan.camera[2]);
    camera.up.set(0, 1, 0);
    orbit.update();
    controls.current = orbit;

    return () => {
      orbit.dispose();
      controls.current = null;
    };
  }, [camera, gl, plan]);

  // Damping only settles if the controls are stepped every frame, as the old manager did.
  useFrame(() => controls.current?.update());

  return null;
}
