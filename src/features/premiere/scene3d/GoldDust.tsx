import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/shared/lib/random';
import { GOLD_DUST_FRAGMENT_SHADER, GOLD_DUST_VERTEX_SHADER } from './shaders/goldDust';
import type { PremiereStore } from './premiereStore';

/** Fixed seed for the atmosphere: the dust used to be random on every load (ADDENDUM-022 §4.0.1). */
export const DUST_SEED = 1920;
/** How many flecks drift through the corridor. */
export const DUST_COUNT = 950;

export interface GoldDustProps {
  store: PremiereStore;
}

/** Champagne gold dust and diamond confetti through the whole fly-through corridor. */
export function GoldDust({ store }: GoldDustProps) {
  const material = useRef<THREE.ShaderMaterial>(null!);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uCamZ: { value: 10 } }), []);

  const geometry = useMemo(() => {
    const random = mulberry32(DUST_SEED);
    const positions = new Float32Array(DUST_COUNT * 3);
    const scales = new Float32Array(DUST_COUNT);
    const phases = new Float32Array(DUST_COUNT);

    for (let i = 0; i < DUST_COUNT; i += 1) {
      positions[i * 3] = (random() - 0.5) * 24;
      positions[i * 3 + 1] = (random() - 0.5) * 14;
      positions[i * 3 + 2] = 12 - random() * 136; // spans the whole theatrical Z corridor
      scales[i] = 0.4 + random() * 1.8;
      phases[i] = random() * Math.PI * 2;
    }

    const built = new THREE.BufferGeometry();
    built.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    built.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    built.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    return built;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const scene = store.getState();
    material.current.uniforms.uTime.value = scene.freezeAt ?? state.clock.elapsedTime;
    material.current.uniforms.uCamZ.value = state.camera.position.z;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={GOLD_DUST_VERTEX_SHADER}
        fragmentShader={GOLD_DUST_FRAGMENT_SHADER}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
