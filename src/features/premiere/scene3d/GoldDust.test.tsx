// @vitest-environment jsdom
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DUST_COUNT, GoldDust } from './GoldDust';
import { createPremiereStore } from './premiereStore';

function PlaceCamera({ z }: { z: number }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.position.set(0, 0, z);
  }, [camera, z]);
  return null;
}

async function render(freezeAt: number | null) {
  const store = createPremiereStore(freezeAt === null ? {} : { freezeAt });
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <PlaceCamera z={10.5} />
      <GoldDust store={store} />
    </>,
  );
  await renderer.advanceFrames(1, 0.016);
  const points = renderer.scene.children.find((child) => child.type === 'Points')
    ?.instance as THREE.Points;
  return { renderer, points, store };
}

describe('GoldDust', () => {
  it('spreads a deterministic field across the corridor', async () => {
    const first = await render(0);
    const second = await render(0);
    const position = first.points.geometry.getAttribute('position');
    expect(position.count).toBe(DUST_COUNT);
    expect(first.points.geometry.getAttribute('aScale').count).toBe(DUST_COUNT);
    expect(first.points.geometry.getAttribute('aPhase').count).toBe(DUST_COUNT);

    // Same seed, same field: the dust no longer changes between loads.
    const other = second.points.geometry.getAttribute('position');
    expect(Array.from(position.array)).toEqual(Array.from(other.array));

    const zs = Array.from(position.array).filter((_, index) => index % 3 === 2);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-124);
    expect(Math.max(...zs)).toBeLessThanOrEqual(12);
  });

  it('draws additively with diamond sparkle shaders', async () => {
    const { points } = await render(0);
    const material = points.material as THREE.ShaderMaterial;
    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.vertexShader).toContain('aPhase');
    expect(material.fragmentShader).toContain('gl_PointCoord');
  });

  it('disposes its geometry on unmount', async () => {
    const { renderer, points } = await render(0);
    const dispose = vi.spyOn(points.geometry, 'dispose');
    await renderer.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
