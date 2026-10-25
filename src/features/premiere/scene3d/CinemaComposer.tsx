import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { nitrateLevel } from '../scene/choreography';
import type { PremiereStore } from './premiereStore';
import { sceneElapsed } from './sceneElapsed';
import { CINEMA_NITRATE_SHADER } from './shaders/cinemaNitrate.glsl';

interface CinemaComposerProps {
  store: PremiereStore;
}

/** The exact delivered post chain; render priority 1 makes it the only render path. */
export function CinemaComposer({ store }: CinemaComposerProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const passes = useMemo(() => {
    const composer = new EffectComposer(gl);
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      0.56,
      0.64,
      0.78
    );
    const nitrate = new ShaderPass(CINEMA_NITRATE_SHADER);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloom);
    composer.addPass(nitrate);
    composer.addPass(new OutputPass());
    return { composer, bloom, nitrate };
    // Size is applied by the resize effect below; recreation only follows core objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, scene]);

  useEffect(() => () => passes.composer.dispose(), [passes]);
  useEffect(() => {
    passes.composer.setSize(size.width, size.height);
    passes.bloom.resolution.set(size.width, size.height);
    passes.nitrate.uniforms.uAspect.value = size.width / Math.max(1, size.height);
  }, [passes, size.height, size.width]);

  useFrame((state) => {
    const premiere = store.getState();
    passes.nitrate.uniforms.uTime.value = sceneElapsed(store, state);
    passes.nitrate.uniforms.uNitrate.value = nitrateLevel({
      time: premiere.currentTime,
      mode: premiere.isNitrateForced ? 'forced' : 'auto',
    });
    passes.composer.render();
  }, 1);

  return null;
}
