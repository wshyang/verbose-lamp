import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { nitrateStrength } from '../scene/choreography';
import { createCinemaComposer } from './composer';
import type { PremiereStore } from './premiereStore';

export interface CinemaComposerProps {
  store: PremiereStore;
}

/**
 * Owns the single render path (ADDENDUM-022 §6.3). A positive `useFrame` priority tells R3F
 * to stop rendering the scene itself, so the composer is the only thing that draws.
 */
export function CinemaComposer({ store }: CinemaComposerProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const pipeline = useMemo(
    () => createCinemaComposer(gl, scene, camera, size.width, size.height),
    [camera, gl, scene],
  );

  useEffect(() => {
    pipeline.setSize(size.width, size.height);
  }, [pipeline, size.height, size.width]);

  useEffect(() => () => pipeline.dispose(), [pipeline]);

  useFrame((state) => {
    const playback = store.getState();
    pipeline.setNitrate(
      playback.freezeAt ?? state.clock.elapsedTime,
      nitrateStrength(playback.currentTime, playback.isNitrateForced),
    );
    pipeline.render();
  }, 1);

  return null;
}
