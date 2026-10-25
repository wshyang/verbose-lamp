import { useEffect, useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { createScreenBorderRig, type ScreenBorderRig } from '@/features/art-deco-frame';
import { usePremiereStoreApi } from './usePremiereStore';

/**
 * The poster's printed edge border (ADDENDUM-022 §2.3): the rig parents
 * itself to the camera (PremiereCanvas keeps the camera in the scene
 * graph), so this component renders nothing — it owns the rig's
 * lifecycle. Created in an effect because dispose() detaches the root
 * from the camera, which keeps mount/unmount symmetric. Style and
 * enabled follow the store by subscription; aspect follows the canvas.
 */
export function ScreenBorder() {
  const store = usePremiereStoreApi();
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const rigRef = useRef<ScreenBorderRig | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    const state = store.getState();
    const { width, height } = sizeRef.current;
    const rig = createScreenBorderRig(
      camera as PerspectiveCamera,
      state.borderStyle,
      width / Math.max(1, height),
    );
    rig.setEnabled(state.isBorderEnabled);
    const unsubscribe = store.subscribe((next, prev) => {
      if (next.borderStyle !== prev.borderStyle) rig.setStyle(next.borderStyle);
      if (next.isBorderEnabled !== prev.isBorderEnabled) rig.setEnabled(next.isBorderEnabled);
    });
    rigRef.current = rig;
    return () => {
      unsubscribe();
      rig.dispose();
      rigRef.current = null;
    };
  }, [store, camera]);

  useEffect(() => {
    rigRef.current?.setViewport(size.width / Math.max(1, size.height));
  }, [size]);

  useFrame(({ clock }) => {
    rigRef.current?.update(store.getState().freezeAt ?? clock.elapsedTime);
  });

  return null;
}
