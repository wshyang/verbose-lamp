import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from 'zustand';
import { createScreenBorderRig } from '@/features/art-deco-frame';
import type { PremiereStore } from './premiereStore';
import { sceneElapsed } from './sceneElapsed';

interface ScreenBorderProps {
  store: PremiereStore;
}

/** Camera-parented poster proscenium, created by the delivered rig builder. */
export function ScreenBorder({ store }: ScreenBorderProps) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const borderStyle = useStore(store, (state) => state.borderStyle);
  const isBorderEnabled = useStore(store, (state) => state.isBorderEnabled);
  const aspect = size.width / Math.max(1, size.height);

  const rig = useMemo(
    () => createScreenBorderRig(camera, store.getState().borderStyle, aspect),
    // The rig is created once for this camera; later aspect changes call setViewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera, store]
  );

  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => rig.setStyle(borderStyle), [borderStyle, rig]);
  useEffect(() => rig.setEnabled(isBorderEnabled), [isBorderEnabled, rig]);
  useEffect(() => rig.setViewport(aspect), [aspect, rig]);
  useFrame((state) => rig.update(sceneElapsed(store, state)));

  return null;
}
