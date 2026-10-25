import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { greenLight } from '../scene/choreography';
import type { PremiereStore } from './premiereStore';
import { sceneElapsed } from './sceneElapsed';
import { GREEN_LIGHT_FRAGMENT, GREEN_LIGHT_VERTEX } from './shaders/greenLight.glsl';

interface GreenLightProps {
  store: PremiereStore;
}

/** Daisy's distant emerald dock light: delivered shader, pure intensity/placement. */
export function GreenLight({ store }: GreenLightProps) {
  const green = useMemo(() => {
    const uniforms = { uTime: { value: 0 }, uIntensity: { value: 1 } };
    const geometry = new THREE.PlaneGeometry(14, 10);
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: GREEN_LIGHT_VERTEX,
      fragmentShader: GREEN_LIGHT_FRAGMENT,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, -0.15, -9.5);
    return { uniforms, geometry, material, mesh };
  }, []);

  useEffect(
    () => () => {
      green.geometry.dispose();
      green.material.dispose();
    },
    [green]
  );

  useFrame((state) => {
    const currentTime = store.getState().currentTime;
    const pose = greenLight({ time: currentTime, heroZ: SEQUENCE_CHAPTERS[4].zPosition });
    green.uniforms.uTime.value = sceneElapsed(store, state);
    green.uniforms.uIntensity.value = pose.intensity;
    green.mesh.position.z = pose.z;
    green.mesh.visible = pose.intensity > 0.01;
  });

  return <primitive object={green.mesh} />;
}
