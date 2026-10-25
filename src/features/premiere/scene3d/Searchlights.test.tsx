// @vitest-environment jsdom
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer, { act } from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { searchlightSway } from '../scene/choreography';
import { Searchlights } from './Searchlights';
import { createPremiereStore } from './premiereStore';

function PlaceCamera({ z }: { z: number }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.position.set(0, 0, z);
  }, [camera, z]);
  return null;
}

async function render(freezeAt: number, cameraZ = 10.5) {
  const store = createPremiereStore({ freezeAt });
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <PlaceCamera z={cameraZ} />
      <Searchlights store={store} />
    </>,
  );
  await renderer.advanceFrames(1, 0.016);
  const group = renderer.scene.children.find((child) => child.type === 'Group')?.instance as THREE.Group;
  return { renderer, group, store };
}

describe('Searchlights', () => {
  it('hangs the beams behind the camera and sways them in counter-phase', async () => {
    const { group } = await render(4);
    const sway = searchlightSway(4);
    const [left, right] = group.children as THREE.Mesh[];

    expect(group.position.z).toBeCloseTo(10.5 - 12);
    expect(left.position.x).toBe(-6.5);
    expect(right.position.x).toBe(6.5);
    expect(left.rotation.z).toBeCloseTo(sway.left, 6);
    expect(right.rotation.z).toBeCloseTo(sway.right, 6);
    expect(left.rotation.z).toBeLessThan(0);
    expect(right.rotation.z).toBeGreaterThan(0);
  });

  it('uses the additive, depth-silent beam material', async () => {
    const { group } = await render(1);
    const beam = group.children[0] as THREE.Mesh;
    const material = beam.material as THREE.MeshBasicMaterial;
    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(THREE.DoubleSide);
    expect((beam.geometry as THREE.PlaneGeometry).parameters).toMatchObject({
      width: 7.5,
      height: 26,
    });
  });

  it('anchors to the chapter in orbit mode', async () => {
    const { renderer, group, store } = await render(4);
    act(() => store.getState().setCameraMode('orbit'));
    act(() => store.getState().setTime(SEQUENCE_CHAPTERS[1].startTime + 0.5));
    await renderer.advanceFrames(1, 0.016);
    expect(group.position.z).toBeCloseTo(SEQUENCE_CHAPTERS[1].zPosition - 3.5);
  });

  it('disposes the beam texture on unmount', async () => {
    const { renderer, group } = await render(2);
    const material = (group.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const texture = material.map as THREE.Texture;
    const dispose = vi.spyOn(texture, 'dispose');

    await renderer.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
