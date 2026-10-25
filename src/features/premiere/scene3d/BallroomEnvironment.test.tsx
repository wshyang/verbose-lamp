// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { BallroomEnvironment } from './BallroomEnvironment';

/**
 * The environment bake is a real GPU render, so the component's contract is the one
 * thing worth testing: it attachers the texture to the scene, and it takes it away and
 * disposes it on unmount (ADDENDUM-022 §6 step 2.3).
 */
const bakes = vi.hoisted(() => ({ created: [] as THREE.Texture[] }));

vi.mock('../scene/environment', () => ({
  createBallroomEnvironment: () => {
    const texture = new THREE.Texture();
    bakes.created.push(texture);
    return texture;
  },
}));

describe('BallroomEnvironment', () => {
  it('attaches the baked environment and disposes it on unmount', async () => {
    bakes.created.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<BallroomEnvironment />);
    const scene = renderer.scene.instance as THREE.Scene;

    expect(bakes.created).toHaveLength(1);
    expect(scene.environment).toBe(bakes.created[0]);
    const dispose = vi.spyOn(bakes.created[0], 'dispose');

    await renderer.unmount();

    expect(scene.environment).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
