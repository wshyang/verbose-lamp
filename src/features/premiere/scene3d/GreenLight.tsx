import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { greenLight } from '../scene/choreography';
import { greenLightFragmentShader, greenLightVertexShader } from './shaders/greenLight.glsl';
import { usePremiereStoreApi } from './usePremiereStore';

/**
 * daisy's green dock light (ADDENDUM-022 §2.3): an additive shader plane
 * whose intensity and depth come from the pure greenLight() curve,
 * aimed at the hero chapter exactly as the manager aimed it. Uniform
 * writes go through the material ref — R3F clones the `uniforms` prop
 * on apply, so the memoised object only seeds the initial values.
 */
export function GreenLight() {
  const store = usePremiereStoreApi();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 1 } }), []);

  useFrame(({ clock }) => {
    const material = materialRef.current;
    if (!meshRef.current || !material) return;
    const { currentTime, freezeAt } = store.getState();
    const green = greenLight(currentTime, SEQUENCE_CHAPTERS[4].zPosition);
    material.uniforms.uTime.value = freezeAt ?? clock.elapsedTime;
    material.uniforms.uIntensity.value = green.intensity;
    meshRef.current.position.z = green.z;
    meshRef.current.visible = green.intensity > 0.01;
  });

  return (
    <mesh ref={meshRef} position={[0, -0.15, -9.5]}>
      <planeGeometry args={[14, 10]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={greenLightVertexShader}
        fragmentShader={greenLightFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
