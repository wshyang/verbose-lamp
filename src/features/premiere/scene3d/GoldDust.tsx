import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { createPrng } from '@/shared/lib/random';
import { goldDustFragmentShader, goldDustVertexShader } from './shaders/goldDust.glsl';
import { usePremiereStoreApi } from './usePremiereStore';

/** Fixed seed — the dust field is part of the scenery, never a surprise. */
const DUST_SEED = 1920;
const DUST_COUNT = 950;

/**
 * The stereoscopic champagne dust field (ADDENDUM-022 §2.3): the seeded
 * 950-mote cloud spanning the whole Z corridor, built identically to the
 * manager's so every frozen baseline keeps its stars. Uniform writes go
 * through the material ref — R3F clones the `uniforms` prop on apply,
 * so the memoised object only seeds the initial values.
 */
export function GoldDust() {
  const store = usePremiereStoreApi();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(DUST_COUNT * 3);
    const scales = new Float32Array(DUST_COUNT);
    const phases = new Float32Array(DUST_COUNT);
    const random = createPrng(DUST_SEED);
    for (let i = 0; i < DUST_COUNT; i++) {
      positions[i * 3] = (random() - 0.5) * 24;
      positions[i * 3 + 1] = (random() - 0.5) * 14;
      positions[i * 3 + 2] = 12 - random() * 136; // spans entire theatrical Z corridor
      scales[i] = 0.4 + random() * 1.8;
      phases[i] = random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    return geo;
  }, []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uCamZ: { value: 10 } }), []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera, clock }) => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uTime.value = store.getState().freezeAt ?? clock.elapsedTime;
    material.uniforms.uCamZ.value = camera.position.z;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={goldDustVertexShader}
        fragmentShader={goldDustFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
