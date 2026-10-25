import { useRef, useState } from 'react';
import { parseFreezeAt } from '../model/freeze';
import { parseRenderer, type RendererMode } from '../model/renderer';
import { createPremiereStore, type PremiereStoreApi } from '../scene3d/premiereStore';

/**
 * Which renderer the URL asks for, and — for the React scene only — its store.
 * Created lazily and once: a store rebuilt on every render would reset playback.
 */
export function useRendererSelection(): { renderer: RendererMode; store: PremiereStoreApi | null } {
  const [renderer] = useState<RendererMode>(() => parseRenderer(window.location.search));
  const storeRef = useRef<PremiereStoreApi | null>(null);
  if (renderer === 'r3f' && storeRef.current === null) {
    storeRef.current = createPremiereStore({ freezeAt: parseFreezeAt(window.location.search) ?? undefined });
  }
  return { renderer, store: storeRef.current };
}
