import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FORCED_NITRATE, openingNitrate } from '../scene/choreography';
import {
  CINEMA_NITRATE_FRAGMENT,
  CINEMA_NITRATE_VERTEX,
  createCinemaNitrateUniforms,
} from './shaders/cinemaNitrate';
import type { PremiereStore } from './premiereStore';

/** The bloom the film has always used: restrained, high threshold. */
export const BLOOM = { strength: 0.56, radius: 0.64, threshold: 0.78 } as const;

/**
 * The post pipeline (ADDENDUM-022 §6 step 2.3), unchanged from the manager: bloom, then
 * the silver-nitrate pass, then output. It is deliberately *not* `@react-three/postprocessing`
 * — a different bloom is a different picture, and Phase 4 is where that would be tried.
 *
 * The `useFrame` priority is positive, which tells R3F to skip its own render: there is
 * exactly one render path, as there was before.
 */
export function CinemaComposer({ store }: { store: PremiereStore }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const pipeline = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      BLOOM.strength,
      BLOOM.radius,
      BLOOM.threshold
    );
    composer.addPass(bloom);

    const nitrate = new ShaderPass({
      uniforms: createCinemaNitrateUniforms(size.width / Math.max(1, size.height)),
      vertexShader: CINEMA_NITRATE_VERTEX,
      fragmentShader: CINEMA_NITRATE_FRAGMENT,
    });
    composer.addPass(nitrate);

    composer.addPass(new OutputPass());

    return { composer, bloom, nitrate };
  }, [gl, scene, camera]);

  useEffect(
    () => () => {
      pipeline.composer.dispose();
    },
    [pipeline]
  );

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    pipeline.composer.setSize(size.width, size.height);
    pipeline.bloom.resolution.set(size.width, size.height);
    pipeline.nitrate.uniforms.uAspect.value = aspect;
  }, [pipeline, size]);

  useFrame(() => {
    const { currentTime, elapsed, isNitrateForced } = store.getState();
    pipeline.nitrate.uniforms.uTime.value = elapsed;
    pipeline.nitrate.uniforms.uNitrate.value = isNitrateForced ? FORCED_NITRATE : openingNitrate(currentTime);
    pipeline.composer.render();
  }, 1);

  return null;
}
