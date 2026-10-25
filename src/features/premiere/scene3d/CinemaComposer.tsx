import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { nitrateLevel } from '../scene/choreography';
import { CinemaNitrateShader } from './shaders';
import type { PremiereStoreApi } from './premiereStore';

/** Bloom is kept exactly as it was: a different algorithm would change the glow. */
export const BLOOM = { strength: 0.56, radius: 0.64, threshold: 0.78 } as const;
/** Any positive `useFrame` priority disables R3F's own render, giving one path. */
const RENDER_PRIORITY = 2;

/**
 * The post chain, reused verbatim from the imperative renderer:
 * RenderPass → UnrealBloomPass → silver-nitrate ShaderPass → OutputPass.
 */
export function CinemaComposer({ store }: { store: PremiereStoreApi }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const chain = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      BLOOM.strength,
      BLOOM.radius,
      BLOOM.threshold
    );
    composer.addPass(bloom);
    const nitrate = new ShaderPass(CinemaNitrateShader);
    nitrate.uniforms.uAspect.value = size.width / Math.max(1, size.height);
    composer.addPass(nitrate);
    composer.addPass(new OutputPass());
    return { composer, bloom, nitrate };
  }, [gl, scene, camera, size.width, size.height]);

  useEffect(
    () => () => {
      chain.composer.dispose();
      chain.bloom.dispose();
    },
    [chain]
  );

  useEffect(() => {
    chain.composer.setSize(size.width, size.height);
    chain.bloom.resolution.set(size.width, size.height);
    chain.nitrate.uniforms.uAspect.value = size.width / Math.max(1, size.height);
  }, [chain, size]);

  useFrame(() => {
    const state = store.getState();
    chain.nitrate.uniforms.uTime.value = state.elapsed;
    chain.nitrate.uniforms.uNitrate.value = nitrateLevel({
      t: state.currentTime,
      forced: state.isNitrateForced,
    });
    chain.composer.render();
  }, RENDER_PRIORITY);

  return null;
}
