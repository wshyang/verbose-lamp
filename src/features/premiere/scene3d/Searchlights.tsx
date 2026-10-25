import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { searchlightSway } from '../scene/choreography';
import { createSearchlightTexture } from '../scene/searchlightTexture';
import { usePremiereStoreApi } from './usePremiereStore';

/**
 * The sweeping premiere searchlights (ADDENDUM-022 §2.3): two additive
 * beam planes sharing one geometry and material, swayed around z by the
 * pure searchlightSway — construction copied from buildAtmosphericWorld.
 */
export function Searchlights() {
  const store = usePremiereStoreApi();
  const leftRef = useRef<THREE.Mesh>(null);
  const rightRef = useRef<THREE.Mesh>(null);
  const beamTexture = useMemo(createSearchlightTexture, []);
  const beamGeometry = useMemo(() => new THREE.PlaneGeometry(7.5, 26), []);
  const beamMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: beamTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [beamTexture],
  );

  useEffect(
    () => () => {
      beamTexture.dispose();
      beamGeometry.dispose();
      beamMaterial.dispose();
    },
    [beamTexture, beamGeometry, beamMaterial],
  );

  useFrame(({ clock }) => {
    if (!leftRef.current || !rightRef.current) return;
    const elapsed = store.getState().freezeAt ?? clock.elapsedTime;
    const sway = searchlightSway(elapsed);
    leftRef.current.rotation.z = sway.left;
    rightRef.current.rotation.z = sway.right;
  });

  return (
    <>
      <mesh
        ref={leftRef}
        geometry={beamGeometry}
        material={beamMaterial}
        position={[-6.5, -4, -9.5]}
        rotation={[0, 0, -0.38]}
      />
      <mesh
        ref={rightRef}
        geometry={beamGeometry}
        material={beamMaterial}
        position={[6.5, -4, -9.5]}
        rotation={[0, 0, 0.38]}
      />
    </>
  );
}
