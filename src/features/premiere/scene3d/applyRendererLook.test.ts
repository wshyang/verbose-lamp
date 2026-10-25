import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PREMIERE_CANVAS, applyRendererLook } from './applyRendererLook';

function targets() {
  const gl = { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 180);
  return { gl, scene, camera };
}

// Every number here is what the former imperative manager's constructor set by hand.
describe('PREMIERE_CANVAS', () => {
  it('keeps the manager’s lens, renderer and atmosphere settings', () => {
    expect(PREMIERE_CANVAS.camera).toEqual({ fov: 42, near: 0.1, far: 180, position: [0, 0, 10.5] });
    expect(PREMIERE_CANVAS.dpr).toEqual([1, 2]);
    expect(PREMIERE_CANVAS.gl).toEqual({ antialias: true, powerPreference: 'high-performance', alpha: false });
    expect(PREMIERE_CANVAS.toneMappingExposure).toBe(1.18);
    expect(PREMIERE_CANVAS.background).toBe('#050407');
    expect(PREMIERE_CANVAS.fogDensity).toBe(0.022);
  });
});

describe('applyRendererLook', () => {
  it('applies ACES filmic tone mapping at the shipped exposure', () => {
    const { gl, scene, camera } = targets();

    applyRendererLook({ gl, scene, camera });

    expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(gl.toneMappingExposure).toBe(1.18);
  });

  it('paints the near-black background and a matching exponential fog', () => {
    const { gl, scene, camera } = targets();

    applyRendererLook({ gl, scene, camera });

    expect((scene.background as THREE.Color).getHexString()).toBe('050407');
    const fog = scene.fog as THREE.FogExp2;
    expect(fog).toBeInstanceOf(THREE.FogExp2);
    expect(fog.color.getHexString()).toBe('050407');
    expect(fog.density).toBe(0.022);
  });

  // R3F's default camera is not in the scene graph, and the screen border is parented to
  // the camera. Without this the proscenium silently disappears.
  it('adds the camera to the scene, so a camera-parented border is rendered', () => {
    const { gl, scene, camera } = targets();
    expect(scene.children).not.toContain(camera);

    applyRendererLook({ gl, scene, camera });

    expect(scene.children).toContain(camera);
  });

  it('reaches a child parented to the camera once the camera is in the scene', () => {
    const { gl, scene, camera } = targets();
    const border = new THREE.Group();
    camera.add(border);

    applyRendererLook({ gl, scene, camera });

    let reached = false;
    scene.traverse((node) => {
      if (node === border) reached = true;
    });
    expect(reached).toBe(true);
  });

  it('is safe to apply twice without duplicating the camera', () => {
    const { gl, scene, camera } = targets();

    applyRendererLook({ gl, scene, camera });
    applyRendererLook({ gl, scene, camera });

    expect(scene.children.filter((child) => child === camera)).toHaveLength(1);
  });
});
