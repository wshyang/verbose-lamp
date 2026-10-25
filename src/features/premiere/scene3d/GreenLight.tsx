import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { greenLight } from '../scene/choreography';
import { GREEN_LIGHT_FRAGMENT_SHADER, GREEN_LIGHT_VERTEX_SHADER } from './shaders/greenLight';
import type { PremiereStore } from './premiereStore';

export interface GreenLightProps {
  store: PremiereStore;
}

const HERO_Z = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1].zPosition;

/** The green light across the bay, and its finale bookend (ADDENDUM-022 §6.3). */
export function GreenLight({ store }: GreenLightProps) {
  const mesh = useRef<THREE.Mesh>(null!);
  const material = useRef<THREE.ShaderMaterial>(null!);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uIntensity: { value: 1 } }),
    [],
  );

  useFrame((state) => {
    const scene = store.getState();
    const glow = greenLight(scene.currentTime, HERO_Z);
    material.current.uniforms.uTime.value = scene.freezeAt ?? state.clock.elapsedTime;
    material.current.uniforms.uIntensity.value = glow.intensity;
    mesh.current.position.z = glow.z;
    mesh.current.visible = glow.intensity > 0.01;
  });

  return (
    <mesh ref={mesh} position={[0, -0.15, -7.5]}>
      <planeGeometry args={[14, 10]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={GREEN_LIGHT_VERTEX_SHADER}
        fragmentShader={GREEN_LIGHT_FRAGMENT_SHADER}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
