// @vitest-environment jsdom
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer, { act } from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { DecoWall } from './DecoWall';
import { createPremiereStore } from './premiereStore';

const textures = vi.hoisted(() => {
  const make = () => ({ dispose: vi.fn() });
  return { map: make(), normalMap: make(), roughnessMap: make() };
});

vi.mock('../scene/environment', () => ({
  createDecoWallpaperTextures: () => textures,
}));

/** Puts the test renderer's camera where the shot expects it. */
function PlaceCamera({ z }: { z: number }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.position.set(0, 0, z);
  }, [camera, z]);
  return null;
}

async function renderWall(store = createPremiereStore()) {
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <PlaceCamera z={10.5} />
      <DecoWall store={store} />
    </>,
  );
  await renderer.advanceFrames(1, 0.016);
  const group = renderer.scene.children.find((child) => child.type === 'Group')?.instance as THREE.Group;
  return { renderer, group, store };
}

describe('DecoWall', () => {
  it('hangs the wall behind the camera chamber in cinema mode', async () => {
    const { group } = await renderWall();
    expect(group.position.z).toBeCloseTo(10.5 - 12);
    const wall = group.children[0] as THREE.Mesh;
    expect(wall.position.z).toBe(-14.5);
    expect((wall.material as THREE.MeshStandardMaterial).metalness).toBe(0.72);
    expect((wall.material as THREE.MeshStandardMaterial).normalScale.x).toBeCloseTo(1.6);
  });

  it('anchors to the active card in orbit mode', async () => {
    const store = createPremiereStore();
    const { renderer, group } = await renderWall(store);
    act(() => store.getState().setCameraMode('orbit'));
    act(() => store.getState().setTime(SEQUENCE_CHAPTERS[2].startTime + 1));
    await renderer.advanceFrames(1, 0.016);
    expect(group.position.z).toBeCloseTo(SEQUENCE_CHAPTERS[2].zPosition - 3.5);
  });

  it('disposes all three wallpaper textures on unmount', async () => {
    const { renderer } = await renderWall();
    await renderer.unmount();
    expect(textures.map.dispose).toHaveBeenCalled();
    expect(textures.normalMap.dispose).toHaveBeenCalled();
    expect(textures.roughnessMap.dispose).toHaveBeenCalled();
  });
});
