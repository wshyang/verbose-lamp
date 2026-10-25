import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { searchlightSway } from '../scene/choreography';
import type { PremiereStoreApi } from './premiereStore';
import { createSearchlightTexture } from './searchlightTexture';

export const SEARCHLIGHT_BEAM = {
  size: [7.5, 26] as [number, number],
  left: { position: [-6.5, -4, -9.5] as [number, number, number], rest: -0.38 },
  right: { position: [6.5, -4, -9.5] as [number, number, number], rest: 0.38 },
} as const;

/**
 * The 1920s premiere searchlight cones (ADDENDUM-022 §2.3): two additive beams that sway
 * in counter-phase with the shader clock (see `searchlightSway`). Both share one texture,
 * geometry and material, all released on unmount.
 */
export function Searchlights({ store }: { store: PremiereStoreApi }) {
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
    [texture],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
    [geometry, material, texture],
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
