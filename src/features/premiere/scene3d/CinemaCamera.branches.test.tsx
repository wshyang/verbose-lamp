// @vitest-environment jsdom
import 'vitest-canvas-mock';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { resolveViewportFit } from '../scene/responsiveLayout';
import { CinemaCamera } from './CinemaCamera';
import { createPremiereStore } from './premiereStore';

const controls = vi.hoisted(() => ({
  target: { values: [] as number[], set: vi.fn((...values: number[]) => { controls.target.values = values; }) },
  update: vi.fn(),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: forwardRef((_props: unknown, ref) => {
    useImperativeHandle(ref, () => controls);
    return null;
  }),
}));

function CameraProbe({ onCamera }: { onCamera: (camera: THREE.Camera) => void }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => onCamera(camera), [camera, onCamera]);
  return null;
}

describe('CinemaCamera orbit/live branches', () => {
  it('focuses orbit controls, ignores frames in orbit, then resumes live cinema', async () => {
    let camera!: THREE.PerspectiveCamera;
    const store = createPremiereStore({ freezeAt: null });
    store.getState().setCameraMode('orbit');
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <CinemaCamera store={store} viewportFit={resolveViewportFit(1440, 900, false)} />
        <CameraProbe onCamera={(next) => { camera = next as THREE.PerspectiveCamera; }} />
      </>
    );
    const orbitPosition = camera.position.clone();
    expect(controls.target.set).toHaveBeenCalled();
    expect(controls.update).toHaveBeenCalled();
    await renderer.advanceFrames(1, 0.1);
    expect(camera.position).toEqual(orbitPosition);

    await ReactThreeTestRenderer.act(async () => store.getState().setCameraMode('cinema'));
    await renderer.advanceFrames(1, 0.1);
    expect(camera.up.y).toBe(1);
    expect(Number.isFinite(camera.position.z)).toBe(true);
    await renderer.unmount();
  });
});
