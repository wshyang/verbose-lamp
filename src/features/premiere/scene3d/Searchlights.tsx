import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { searchlightSway } from '../scene/choreography';
import { createSearchlightTexture } from '../scene/searchlightTexture';
import type { PremiereStore } from './premiereStore';
import { sceneElapsed } from './sceneElapsed';

interface SearchlightsProps {
  store: PremiereStore;
}

/** The paired volumetric premiere beams behind the active chamber. */
export function Searchlights({ store }: SearchlightsProps) {
  const leftRef = useRef<THREE.Mesh>(null);
  const rightRef = useRef<THREE.Mesh>(null);
  const beam = useMemo(() => {
    const texture = createSearchlightTexture();
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geometry = new THREE.PlaneGeometry(7.5, 26);
    return { texture, material, geometry };
  }, []);

  useEffect(
    () => () => {
      beam.geometry.dispose();
      beam.material.dispose();
      beam.texture.dispose();
    },
    [beam]
  );

  useFrame((state) => {
    const sway = searchlightSway(sceneElapsed(store, state));
    // Both beam meshes below are always mounted when frames run.
    (leftRef.current as THREE.Mesh).rotation.z = sway.left;
    (rightRef.current as THREE.Mesh).rotation.z = sway.right;
  });

  return (
    <>
      <mesh ref={leftRef} geometry={beam.geometry} material={beam.material} position={[-6.5, -4, -9.5]} />
      <mesh ref={rightRef} geometry={beam.geometry} material={beam.material} position={[6.5, -4, -9.5]} />
    </>
  );
}
