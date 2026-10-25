import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { greenLight } from '../scene/choreography';
import { createGreenLightUniforms, greenLightFrag, greenLightVert } from '../scene/shaders';
import type { PremiereStoreApi } from './premiereStore';

export const GREEN_LIGHT_PLANE = {
  size: [14, 10] as [number, number],
  position: [0, -0.15, -9.5] as [number, number, number],
};

/** The mesh hides itself below this intensity, as the manager did. */
const VISIBLE_ABOVE = 0.01;

/**
 * The iconic distant green light across the dark bay (ADDENDUM-022 §2.3): prominent in
 * Act I, a quieter bookend behind the hero card. Intensity and position come from
 * `greenLight()`; the shader is the extracted `.vert`/`.frag` pair (ADDENDUM-026).
 */
export function GreenLight({ store }: { store: PremiereStoreApi }) {
  const mesh = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(() => createGreenLightUniforms(), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(...GREEN_LIGHT_PLANE.size), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: greenLightVert,
        fragmentShader: greenLightFrag,
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

  useFrame(() => {
    const { currentTime, elapsed } = store.getState();
    const heroZ = SEQUENCE_CHAPTERS[SEQUENCE_CHAPTERS.length - 1].zPosition;
    const beacon = greenLight(currentTime, heroZ);
    uniforms.uTime.value = elapsed;
    uniforms.uIntensity.value = beacon.intensity;
    if (!mesh.current) return;
    mesh.current.position.z = beacon.z;
    mesh.current.visible = beacon.intensity > VISIBLE_ABOVE;
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
