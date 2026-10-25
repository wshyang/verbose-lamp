import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { usePremiereStoreApi } from './usePremiereStore';

/**
 * The manager's window pointermove → smoothed-aim pair (ADDENDUM-022
 * §2.3): raw NDC target on move, `lerp(target, min(1, dt·4.5))` per frame.
 * Frozen scenes ignore the pointer entirely, keeping baselines
 * deterministic — and the smoother freezes with them (dt = 0).
 */
export function usePointerAim(): { readonly current: THREE.Vector2 } {
  const store = usePremiereStoreApi();
  const target = useRef(new THREE.Vector2(0, 0));
  const smooth = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (store.getState().freezeAt !== null) return;
      target.current.set(
        (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1,
        -((event.clientY / Math.max(1, window.innerHeight)) * 2 - 1),
      );
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [store]);

  useFrame((_, delta) => {
    const dt = store.getState().freezeAt !== null ? 0 : Math.min(0.05, delta);
    smooth.current.lerp(target.current, Math.min(1, dt * 4.5));
  }, -1);

  return smooth;
}
