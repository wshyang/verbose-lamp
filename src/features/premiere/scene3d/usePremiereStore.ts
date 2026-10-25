import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { PremiereStore, PremiereStoreState } from './premiereStore';

/**
 * Carries the vanilla premiere store into the Canvas tree (ADDENDUM-022
 * §2.2). Components subscribe with selectors for structural changes
 * (camera mode, hero config) and read `usePremiereStoreApi().getState()`
 * per frame, so playback never re-renders the stage at 60 fps.
 */
export const PremiereStoreContext = createContext<PremiereStore | null>(null);

export function usePremiereStoreApi(): PremiereStore {
  const store = useContext(PremiereStoreContext);
  if (!store) throw new Error('usePremiereStoreApi must be used inside <PremiereCanvas>');
  return store;
}

export function usePremiereStore<T>(selector: (state: PremiereStoreState) => T): T {
  return useStore(usePremiereStoreApi(), selector);
}
