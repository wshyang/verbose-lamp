import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { searchlightSway } from '../scene/choreography';
import { createSearchlightTexture } from './searchlightTexture';
import type { PremiereStore } from './premiereStore';

/** Both beams share one plane and one material; only their transform differs. */
export const SEARCHLIGHT_BEAM = {
  size: [7.5, 26] as [number, number],
  left: { position: [-6.5, -4, -9.5] as [number, number, number], rest: -0.38 },
  right: { position: [6.5, -4, -9.5] as [number, number, number], rest: 0.38 },
} as const;

/**
 * The sweeping 1920s premiere searchlights (ADDENDUM-022 §6 step 2.3). The sway comes
 * from `searchlightSway(elapsed)` — the same function the manager used, so the beams
 * swing in step with every other ambient element.
 */
export function Searchlights({ store }: { store: PremiereStore }) {
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);

  const texture = useMemo(() => createSearchlightTexture(), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(...SEARCHLIGHT_BEAM.size), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [texture]
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
    [geometry, material, texture]
  );

  useFrame(() => {
    const sway = searchlightSway(store.getState().elapsed);
    if (left.current) left.current.rotation.z = sway.left;
    if (right.current) right.current.rotation.z = sway.right;
  });

  return (
    <>
      <mesh
        ref={left}
        name="searchlight-left"
        geometry={geometry}
        material={material}
        position={SEARCHLIGHT_BEAM.left.position}
        rotation={[0, 0, SEARCHLIGHT_BEAM.left.rest]}
      />
      <mesh
        ref={right}
        name="searchlight-right"
        geometry={geometry}
        material={material}
        position={SEARCHLIGHT_BEAM.right.position}
        rotation={[0, 0, SEARCHLIGHT_BEAM.right.rest]}
      />
    </>
  );
}
