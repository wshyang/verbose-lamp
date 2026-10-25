import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FORCED_NITRATE, openingNitrate } from '../scene/choreography';
import { cinemaNitrateShader } from './shaders/cinemaNitrate.glsl';
import { usePremiereStoreApi } from './usePremiereStore';

/**
 * The post pipeline, unchanged (ADDENDUM-022 §2.2): RenderPass → bloom →
 * nitrate → OutputPass, three's own EffectComposer driven from
 * useFrame(…, 1) so R3F hands over the render. Resize writes mirror
 * handleResize; the nitrate amount follows the opening curve unless
 * the nitrate mode is forced.
 */
export function CinemaComposer() {
  const store = usePremiereStoreApi();
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const initialSize = useRef(size).current;

  const passes = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(initialSize.width, initialSize.height),
      0.56, // controlled luxurious specular bloom
      0.64,
      0.78,
    );
    composer.addPass(bloom);
    const nitrate = new ShaderPass(cinemaNitrateShader);
    nitrate.uniforms.uAspect.value = initialSize.width / Math.max(1, initialSize.height);
    composer.addPass(nitrate);
    composer.addPass(new OutputPass());
    return { composer, bloom, nitrate };
  }, [gl, scene, camera, initialSize]);

  useEffect(() => () => passes.composer.dispose(), [passes]);

  useEffect(() => {
    passes.composer.setSize(size.width, size.height);
    passes.bloom.resolution.set(size.width, size.height);
    passes.nitrate.uniforms.uAspect.value = size.width / Math.max(1, size.height);
  }, [passes, size]);

  useFrame(({ clock }) => {
    const { currentTime, freezeAt, isNitrateForced } = store.getState();
    passes.nitrate.uniforms.uTime.value = freezeAt ?? clock.elapsedTime;
    passes.nitrate.uniforms.uNitrate.value = isNitrateForced
      ? FORCED_NITRATE
      : openingNitrate(currentTime);
    passes.composer.render();
  }, 1);

  return null;
}
