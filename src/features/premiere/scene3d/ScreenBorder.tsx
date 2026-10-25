import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from 'zustand';
import type * as THREE from 'three';
import { createScreenBorderRig } from '@/features/art-deco-frame';
import type { PremiereStore } from './premiereStore';

export interface ScreenBorderProps {
  store: PremiereStore;
}

const aspectOf = (width: number, height: number) => width / Math.max(1, height);

/**
 * The printed poster edge as a camera-parented proscenium (ADDENDUM-022 §6.3). It belongs
 * to no card, so it stays at the viewport edge through the whole fly-through.
 */
export function ScreenBorder({ store }: ScreenBorderProps) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const style = useStore(store, (state) => state.screenBorderStyle);
  const enabled = useStore(store, (state) => state.isBorderEnabled);

  const rig = useMemo(
    () =>
      createScreenBorderRig(
        camera,
        store.getState().screenBorderStyle,
        aspectOf(size.width, size.height),
      ),
    // Built once per camera; style and viewport arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera, store],
  );

  useEffect(() => rig.setStyle(style), [rig, style]);

  useEffect(() => rig.setEnabled(enabled), [enabled, rig]);

  useEffect(() => {
    rig.setViewport(aspectOf(size.width, size.height));
  }, [rig, size.height, size.width]);

  useEffect(() => () => rig.dispose(), [rig]);

  useFrame((state) => rig.update(store.getState().freezeAt ?? state.clock.elapsedTime));

  return null;
}
