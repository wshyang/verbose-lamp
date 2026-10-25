import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  cinemaNitrateFrag,
  cinemaNitrateVert,
  createCinemaNitrateUniforms,
} from '../scene/shaders';

/** The bloom the premiere has always used: controlled luxurious specular, no wash-out. */
export const BLOOM_STRENGTH = 0.56;
export const BLOOM_RADIUS = 0.64;
export const BLOOM_THRESHOLD = 0.78;

export interface CinemaComposer {
  render: () => void;
  setSize: (width: number, height: number) => void;
  /** Per-frame filter state: the shader's own clock and the silver-nitrate mix. */
  setNitrate: (time: number, nitrate: number) => void;
  dispose: () => void;
}

const aspectOf = (width: number, height: number): number => width / Math.max(1, height);

/**
 * The post-processing chain, kept on three's own EffectComposer (ADDENDUM-022 §2.2): render
 * pass, bloom, the nitrate/vignette/grain pass, then the output pass. Built outside the
 * component so it can be tested without a GPU. The nitrate shader is the extracted
 * `.vert`/`.frag` pair (ADDENDUM-026).
 */
export function createCinemaComposer(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): CinemaComposer {
  const composer = new EffectComposer(gl);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloom);

  const nitrate = new ShaderPass({
    uniforms: createCinemaNitrateUniforms(),
    vertexShader: cinemaNitrateVert,
    fragmentShader: cinemaNitrateFrag,
  });
  nitrate.uniforms.uAspect.value = aspectOf(width, height);
  composer.addPass(nitrate);

  composer.addPass(new OutputPass());

  return {
    render: () => composer.render(),
    setSize: (nextWidth, nextHeight) => {
      composer.setSize(nextWidth, nextHeight);
      bloom.resolution.set(nextWidth, nextHeight);
      nitrate.uniforms.uAspect.value = aspectOf(nextWidth, nextHeight);
    },
    setNitrate: (time, amount) => {
      nitrate.uniforms.uTime.value = time;
      nitrate.uniforms.uNitrate.value = amount;
    },
    dispose: () => composer.dispose(),
  };
}
