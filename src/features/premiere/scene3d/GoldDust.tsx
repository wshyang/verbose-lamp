import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { createPrng, DUST_SEED } from '@/shared/lib/prng';
import { GOLD_DUST_FRAGMENT, GOLD_DUST_VERTEX } from './shaders/goldDust';
import type { PremiereStore } from './premiereStore';

export const DUST_COUNT = 950;

/**
 * The gold dust field (ADDENDUM-022 §6 step 2.3). Positions come from the shared PRNG
 * with `DUST_SEED`, so the corridor's air is identical frame for frame to the manager's
 * — the likeness gate compares the particles, not just the cards.
 */
export function buildDustGeometry(count = DUST_COUNT): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const phases = new Float32Array(count);
  const random = createPrng(DUST_SEED);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (random() - 0.5) * 24;
    positions[i * 3 + 1] = (random() - 0.5) * 14;
    positions[i * 3 + 2] = 12 - random() * 136; // spans the whole theatrical Z corridor
    scales[i] = 0.4 + random() * 1.8;
    phases[i] = random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geometry;
}

export function GoldDust({ store }: { store: PremiereStore }) {
  const camera = useThree((state) => state.camera);
  const geometry = useMemo(() => buildDustGeometry(), []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uCamZ: { value: 10 } }), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: GOLD_DUST_VERTEX,
        fragmentShader: GOLD_DUST_FRAGMENT,
      }),
    [uniforms]
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame(() => {
    uniforms.uTime.value = store.getState().elapsed;
    uniforms.uCamZ.value = camera.position.z;
  });

  return <points name="gold-dust" geometry={geometry} material={material} />;
}
