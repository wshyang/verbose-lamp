import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createScreenBorderRig } from '@/features/art-deco-frame';
import { usePremiereStore, type PremiereStoreApi } from './premiereStore';

/**
 * The camera-parented proscenium. It stays fixed to the lens while the camera
 * flies, which is why the renderer adds the camera to the scene graph.
 */
export function ScreenBorder({ store }: { store: PremiereStoreApi }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const aspect = size.width / Math.max(1, size.height);
  const isEnabled = usePremiereStore(store, (state) => state.isBorderEnabled);
  const style = usePremiereStore(store, (state) => state.borderStyle);

  const rig = useMemo(
    () => createScreenBorderRig(camera, style, aspect),
    // The rig owns a mesh parented to the camera; it is rebuilt only when the
    // camera object changes, never for a style or viewport tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera]
  );

  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => {
    rig.setStyle(style);
  }, [rig, style]);
  useEffect(() => {
    rig.setEnabled(isEnabled);
  }, [rig, isEnabled]);
  useEffect(() => {
    rig.setViewport(aspect);
  }, [rig, aspect]);

  useFrame(() => {
    rig.update(store.getState().elapsed);
  });

  return null;
}
