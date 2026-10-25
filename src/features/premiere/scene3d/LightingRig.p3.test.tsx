// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import ReactThreeTestRenderer, { act } from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { LightingRig } from './LightingRig';
import { createPremiereStore } from './premiereStore';
import { useEffect } from 'react';

function PlaceCamera({ z }: { z: number }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.position.set(0, 0, z);
  }, [camera, z]);
  return null;
}
async function render(store = createPremiereStore({ freezeAt: 0 })) {
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <PlaceCamera z={10.5} />
      <LightingRig store={store} />
    </>,
  );
  await renderer.advanceFrames(1, 0.016);
  const lights = renderer.scene.children
    .map((child) => child.instance)
    .filter((object): object is THREE.Light => (object as THREE.Light).isLight === true);
  return { renderer, lights, store };
}
describe('LightingRig', () => {
  it('hangs one ambient wash and three point lights', async () => {
    const { lights } = await render();
    expect(lights).toHaveLength(4);
    const [ambient, key, rim, cool] = lights as THREE.Light[];

    expect((ambient as THREE.AmbientLight).isAmbientLight).toBe(true);
    expect(ambient.intensity).toBe(0.35);
    expect(key.color.getHexString()).toBe('ffdf91');
    expect((key as THREE.PointLight).intensity).toBe(28);
    expect((key as THREE.PointLight).distance).toBe(32);
    expect((rim as THREE.PointLight).decay).toBe(1.5);
    expect((cool as THREE.PointLight).decay).toBe(1.6);
  });

  it('orbits the point lights around the chamber in front of the camera', async () => {
    const { lights } = await render();
    const [, key, rim, cool] = lights as THREE.PointLight[];

    // Camera at z = 10.5 → focus 4.0 → key (0, 4, 7.2), rim (−6, −2.2, 5.5), cool (0, 4.5, 2).
    expect(key.position.toArray()).toEqual([0, 4, 7.2]);
    expect(rim.position.toArray()).toEqual([-6, -2.2, 5.5]);
    expect(cool.position.toArray()).toEqual([0, 4.5, 2]);
  });

  it('follows the active card in orbit mode', async () => {
    const store = createPremiereStore({ freezeAt: 0 });
    const { renderer, lights } = await render(store);
    act(() => store.getState().setCameraMode('orbit'));
    act(() => store.getState().setTime(SEQUENCE_CHAPTERS[1].startTime + 0.5));
    await renderer.advanceFrames(1, 0.016);

    const [, key] = lights as THREE.PointLight[];
    const chapter = SEQUENCE_CHAPTERS[1];
    expect(key.position.z).toBeCloseTo(chapter.zPosition + 3.5 + 3.2);
  });
});
