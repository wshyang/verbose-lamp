import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mulberry32 } from '@/shared/lib/random';
import { createGoldDustUniforms, goldDustFrag, goldDustVert } from '../scene/shaders';
import type { PremiereStoreApi } from './premiereStore';

/**
 * Fixed seed for the corridor's air. The shipped dust was `Math.random()` on every load,
 * so no two visits looked alike and the likeness gate could not pin it (ADDENDUM-022 §4).
 */
export const DUST_SEED = 1920;
/** How many flecks drift through the corridor. */
export const DUST_COUNT = 950;

/** Same field the manager built, drawn from a seeded generator so it is identical every time. */
export function buildDustGeometry(count: number = DUST_COUNT): THREE.BufferGeometry {
  const random = mulberry32(DUST_SEED);
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const phases = new Float32Array(count);

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

/** Champagne gold dust and diamond confetti through the whole fly-through corridor. */
export function GoldDust({ store }: { store: PremiereStoreApi }) {
  const geometry = useMemo(() => buildDustGeometry(), []);
  const uniforms = useMemo(() => createGoldDustUniforms(), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: goldDustVert,
        fragmentShader: goldDustFrag,
      }),
    [uniforms],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state) => {
    uniforms.uTime.value = store.getState().elapsed;
    uniforms.uCamZ.value = state.camera.position.z;
  });

  return <points name="gold-dust" geometry={geometry} material={material} />;
}
