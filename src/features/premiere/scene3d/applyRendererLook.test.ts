// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PREMIERE_CANVAS, applyRendererLook } from './applyRendererLook';

/**
 * The renderer look is four numbers and one parenting rule. The rule is the one that
 * bites: R3F's default camera is not in the scene, and the proscenium is parented to the
 * camera, so a port that forgets `scene.add(camera)` silently loses its frame.
 */
function targets() {
  const gl = { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  return { gl, scene, camera };
}

describe('applyRendererLook', () => {
  it('applies the premiere tone mapping and exposure', () => {
    const { gl, scene, camera } = targets();
    applyRendererLook({ gl, scene, camera });

    expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(gl.toneMappingExposure).toBe(PREMIERE_CANVAS.toneMappingExposure);
    expect(PREMIERE_CANVAS.toneMappingExposure).toBe(1.18);
  });

  it('sets the near-black background and exponential fog', () => {
    const { gl, scene, camera } = targets();
    applyRendererLook({ gl, scene, camera });

    expect((scene.background as THREE.Color).getHexString()).toBe('050407');
    const fog = scene.fog as THREE.FogExp2;
    expect(fog.isFogExp2).toBe(true);
    expect(fog.density).toBe(PREMIERE_CANVAS.fogDensity);
  });

  it('puts the camera in the scene graph so the camera-parented border renders', () => {
    const { gl, scene, camera } = targets();
    expect(scene.children).toHaveLength(0);

    applyRendererLook({ gl, scene, camera });

    expect(scene.children).toContain(camera);
  });
});
