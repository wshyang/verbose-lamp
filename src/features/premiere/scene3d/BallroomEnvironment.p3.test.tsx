// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import 'vitest-canvas-mock';

import * as THREE from 'three';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import ReactThreeTestRenderer from '@react-three/test-renderer';

import { BallroomEnvironment } from './BallroomEnvironment';

const env_p3 = vi.hoisted(() => ({
  texture: { dispose: vi.fn() },
  renderers: [] as unknown[],
}));
vi.mock('../scene/environment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scene/environment')>();
  return {
    ...actual,
    createBallroomEnvironment: (renderer: unknown) => {
      env_p3.renderers.push(renderer);
      return env_p3.texture as unknown as THREE.Texture;
    },
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  env_p3.renderers.length = 0;
});
describe('BallroomEnvironment', () => {
  it('builds the environment from the live renderer and hangs it on the scene', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BallroomEnvironment />);
    const scene = renderer.scene.instance as THREE.Scene;

    expect(env_p3.renderers).toHaveLength(1);
    expect((env_p3.renderers[0] as unknown as { isWebGLRenderer?: boolean }).isWebGLRenderer).toBe(true);
    expect(scene.environment).toBe(env_p3.texture);
  });

  it('clears and disposes the environment on unmount', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BallroomEnvironment />);
    const scene = renderer.scene.instance as THREE.Scene;
    await renderer.unmount();

    expect(scene.environment).toBeNull();
    expect(env_p3.texture.dispose).toHaveBeenCalled();
  });
});
