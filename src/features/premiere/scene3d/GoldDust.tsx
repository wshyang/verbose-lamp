import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { createPrng } from '@/shared/lib';
import type { PremiereStore } from './premiereStore';
import { sceneElapsed } from './sceneElapsed';
import { GOLD_DUST_FRAGMENT, GOLD_DUST_VERTEX } from './shaders/goldDust.glsl';

interface GoldDustProps {
  store: PremiereStore;
}

export const DUST_SEED = 1920;
const DUST_COUNT = 950;

function buildDustGeometry(): THREE.BufferGeometry {
  const random = createPrng(DUST_SEED);
  const positions = new Float32Array(DUST_COUNT * 3);
  const scales = new Float32Array(DUST_COUNT);
  const phases = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i += 1) {
    positions[i * 3] = (random() - 0.5) * 24;
    positions[i * 3 + 1] = (random() - 0.5) * 14;
    positions[i * 3 + 2] = 12 - random() * 136;
    scales[i] = 0.4 + random() * 1.8;
    phases[i] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geometry;
}

/** The seeded 950-point champagne dust field; identical on every load. */
export function GoldDust({ store }: GoldDustProps) {
  const dust = useMemo(() => {
    const uniforms = { uTime: { value: 0 }, uCamZ: { value: 10 } };
    const geometry = buildDustGeometry();
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: GOLD_DUST_VERTEX,
      fragmentShader: GOLD_DUST_FRAGMENT,
    });
    return { uniforms, geometry, material, points: new THREE.Points(geometry, material) };
  }, []);

  useEffect(
    () => () => {
      dust.geometry.dispose();
      dust.material.dispose();
    },
    [dust]
  );

  useFrame((state) => {
    dust.uniforms.uTime.value = sceneElapsed(store, state);
    dust.uniforms.uCamZ.value = state.camera.position.z;
  });

  return <primitive object={dust.points} />;
}
