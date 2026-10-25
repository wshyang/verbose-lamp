import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from 'zustand';
import { createScreenBorderRig, type ScreenBorderRig } from '@/features/art-deco-frame';
import type { PremiereStoreApi } from './premiereStore';

/**
 * The poster's printed edge border as a persistent proscenium (ADDENDUM-022 §2.3). The rig
 * is parented to the camera, so it stays at the viewport edge through the whole
 * fly-through and belongs to no card; the camera is added to the scene by
 * `applyRendererLook`, without which the proscenium silently disappears.
 *
 * The rig is built in an effect and held in state, not built inside `useMemo`: creating a
 * GPU object as a render side effect leaks one rig per StrictMode double-render. It is
 * created once per camera, and told about style, visibility and viewport changes.
 */
export function ScreenBorder({ store }: { store: PremiereStoreApi }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const style = useStore(store, (state) => state.borderStyle);
  const enabled = useStore(store, (state) => state.isBorderEnabled);
  const aspect = size.width / Math.max(1, size.height);
  const [rig, setRig] = useState<ScreenBorderRig | null>(null);

  useEffect(() => {
    const { borderStyle, isBorderEnabled } = store.getState();
    const created = createScreenBorderRig(camera as never, borderStyle, aspect);
    created.setEnabled(isBorderEnabled);
    setRig(created);
    return () => {
      created.dispose();
      setRig(null);
    };
    // `aspect` and the live style are applied by the effects below, not by rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, store]);

  useEffect(() => rig?.setStyle(style), [rig, style]);
  useEffect(() => rig?.setEnabled(enabled), [rig, enabled]);
  useEffect(() => rig?.setViewport(aspect), [rig, aspect]);

  useFrame(() => {
    rig?.update(store.getState().elapsed);
  });

  return null;
}
