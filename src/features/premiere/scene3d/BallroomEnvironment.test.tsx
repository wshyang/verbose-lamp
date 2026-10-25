// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { BallroomEnvironment } from './BallroomEnvironment';

const env = vi.hoisted(() => ({
  texture: { dispose: vi.fn() },
  renderers: [] as unknown[],
}));

vi.mock('../scene/environment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scene/environment')>();
  return {
    ...actual,
    createBallroomEnvironment: (renderer: unknown) => {
      env.renderers.push(renderer);
      return env.texture as unknown as THREE.Texture;
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  env.renderers.length = 0;
});

describe('BallroomEnvironment', () => {
  it('builds the environment from the live renderer and hangs it on the scene', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BallroomEnvironment />);
    const scene = renderer.scene.instance as THREE.Scene;

    expect(env.renderers).toHaveLength(1);
    expect((env.renderers[0] as unknown as { isWebGLRenderer?: boolean }).isWebGLRenderer).toBe(true);
    expect(scene.environment).toBe(env.texture);
  });

  it('clears and disposes the environment on unmount', async () => {
    const renderer = await ReactThreeTestRenderer.create(<BallroomEnvironment />);
    const scene = renderer.scene.instance as THREE.Scene;
    await renderer.unmount();

    expect(scene.environment).toBeNull();
    expect(env.texture.dispose).toHaveBeenCalled();
  });
});
