// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import 'vitest-canvas-mock';

import { useEffect } from 'react';

import * as THREE from 'three';

import { useThree } from '@react-three/fiber';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import ReactThreeTestRenderer from '@react-three/test-renderer';

import { BallroomEnvironment } from './BallroomEnvironment';

const env = vi.hoisted(() => ({
  texture: { dispose: vi.fn() },
  create: vi.fn(),
}));
vi.mock('../scene/environment', () => ({ createBallroomEnvironment: env.create }));
function SceneProbe({ onScene }: { onScene: (scene: THREE.Scene) => void }) {
  const scene = useThree((state) => state.scene);
  useEffect(() => onScene(scene), [scene, onScene]);
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  env.create.mockReturnValue(env.texture);
});
describe('BallroomEnvironment', () => {
  it('installs and clears its own environment on unmount', async () => {
    let scene!: THREE.Scene;
    const renderer = await ReactThreeTestRenderer.create(
      <><BallroomEnvironment /><SceneProbe onScene={(next) => { scene = next; }} /></>
    );
    expect(env.create).toHaveBeenCalledOnce();
    expect(scene.environment).toBe(env.texture);
    await renderer.unmount();
    expect(scene.environment).toBeNull();
    expect(env.texture.dispose).toHaveBeenCalledOnce();
  });
});
