import * as THREE from 'three';

/**
 * The renderer, scene and camera settings the premiere has always used
 * (ADDENDUM-022 §6 step 2.2). `GatsbySceneManager` set these by hand; the Canvas sets
 * them once on creation, and the likeness gate is what proves they still match.
 */
export const PREMIERE_CANVAS = {
  dpr: [1, 2] as [number, number],
  gl: { antialias: true, powerPreference: 'high-performance' as const, alpha: false },
  camera: { fov: 42, near: 0.1, far: 180, position: [0, 0, 10.5] as [number, number, number] },
  toneMappingExposure: 1.18,
  background: '#050407',
  fogDensity: 0.022,
} as const;

export interface RendererLookTargets {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

/**
 * Applies the premiere's look and — the part that is easy to lose — adds the camera
 * to the scene. R3F's default camera is *not* in the scene graph, and the screen border
 * is parented to the camera, so without this the proscenium silently disappears.
 */
export function applyRendererLook({ gl, scene, camera }: RendererLookTargets): void {
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = PREMIERE_CANVAS.toneMappingExposure;
  scene.background = new THREE.Color(PREMIERE_CANVAS.background);
  scene.fog = new THREE.FogExp2(PREMIERE_CANVAS.background, PREMIERE_CANVAS.fogDensity);
  scene.add(camera);
}
