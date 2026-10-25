import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from 'zustand';
import { createScreenBorderRig, type ScreenBorderRig } from '@/features/art-deco-frame';
import type { PremiereStore } from './premiereStore';

/**
 * The poster proscenium in front of the camera (ADDENDUM-022 §6 step 2.3).
 *
 * `createScreenBorderRig` already parents its root to the camera it is given and reads
 * the aspect ratio, so this component is only lifetime and change propagation: create
 * once, push style/enabled/aspect changes through, dispose on unmount.
 */
export function ScreenBorder({ store }: { store: PremiereStore }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const rig = useRef<ScreenBorderRig | null>(null);

  const style = useStore(store, (state) => state.screenBorderStyle);
  const enabled = useStore(store, (state) => state.isBorderEnabled);
  const aspect = size.width / Math.max(1, size.height);

  // Created once per camera: the rig owns GPU buffers, so it must not be re-made on
  // every style tweak.
  useMemo(() => {
    rig.current?.dispose();
    rig.current = createScreenBorderRig(camera as never, style, aspect);
    rig.current.setEnabled(store.getState().isBorderEnabled);
    return rig.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useEffect(() => {
    rig.current?.setStyle(style);
  }, [style]);

  useEffect(() => {
    rig.current?.setEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    rig.current?.setViewport(aspect);
  }, [aspect]);

  useEffect(
    () => () => {
      rig.current?.dispose();
      rig.current = null;
    },
    []
  );

  useFrame(() => {
    rig.current?.update(store.getState().elapsed);
  });

  return null;
}
