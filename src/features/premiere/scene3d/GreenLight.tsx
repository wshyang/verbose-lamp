import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { greenLight } from '../scene/choreography';
import { GREEN_LIGHT_FRAGMENT, GREEN_LIGHT_VERTEX } from './shaders/greenLight';
import type { PremiereStore } from './premiereStore';

/** The signet-gate beacon sits just left of the corridor's centre line. */
export const GREEN_LIGHT_PLANE = { size: [14, 10] as [number, number], position: [0, -0.15, -9.5] as [number, number, number] };

/**
 * The distant green light across the dark bay (ADDENDUM-022 §6 step 2.3): visible in
 * Act I and as the film's final bookend. `greenLight(time)` gives intensity and depth;
 * the pulse and the water reflection live in the shader.
 */
export function GreenLight({ store }: { store: PremiereStore }) {
  const mesh = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uIntensity: { value: 1 } }),
    []
  );
  const geometry = useMemo(() => new THREE.PlaneGeometry(...GREEN_LIGHT_PLANE.size), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: GREEN_LIGHT_VERTEX,
        fragmentShader: GREEN_LIGHT_FRAGMENT,
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
    const { currentTime, elapsed } = store.getState();
    const beacon = greenLight(currentTime, SEQUENCE_CHAPTERS);
    uniforms.uTime.value = elapsed;
    uniforms.uIntensity.value = beacon.intensity;
    if (!mesh.current) return;
    mesh.current.position.z = beacon.z;
    // A beacon at zero intensity is still a big additive quad; hide it, as before.
    mesh.current.visible = beacon.intensity > 0.01;
  });

  return (
    <mesh
      ref={mesh}
      name="green-light"
      geometry={geometry}
      material={material}
      position={GREEN_LIGHT_PLANE.position}
    />
  );
}
