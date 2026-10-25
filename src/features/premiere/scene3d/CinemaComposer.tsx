import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { nitrateLevel } from '../scene/choreography';
import { createCinemaComposer } from './composer';
import type { PremiereStoreApi } from './premiereStore';

/** After every pose-setting frame callback, so the composite draws the frame they just made. */
const RENDER_PRIORITY = 1;

/**
 * Owns the single render path (ADDENDUM-022 §2.2). A positive `useFrame` priority tells R3F
 * to stop rendering the scene itself, so the composer is the only thing that draws; the
 * post chain is three's own EffectComposer, kept as it is.
 */
export function CinemaComposer({ store }: { store: PremiereStoreApi }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  // The chain is built for the live renderer, scene and camera only; a resize is applied
  // by the effect below rather than by rebuilding it.
  const pipeline = useMemo(
    () => createCinemaComposer(gl, scene, camera, size.width, size.height),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gl, scene, camera],
  );

  useEffect(() => {
    pipeline.setSize(size.width, size.height);
  }, [pipeline, size.width, size.height]);

  useEffect(() => () => pipeline.dispose(), [pipeline]);

  useFrame(() => {
    const { currentTime, elapsed, isNitrateForced } = store.getState();
    pipeline.setNitrate(elapsed, nitrateLevel(currentTime, isNitrateForced ? 'forced' : 'auto'));
    pipeline.render();
  }, RENDER_PRIORITY);

  return null;
}
