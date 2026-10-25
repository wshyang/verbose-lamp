import type { RootState } from '@react-three/fiber';
import type { PremiereStore } from './premiereStore';

/** Frozen frames use the freeze time as shader/elapsed time, as the gate requires. */
export function sceneElapsed(store: PremiereStore, state: RootState): number {
  return store.getState().freezeAt ?? state.clock.elapsedTime;
}
