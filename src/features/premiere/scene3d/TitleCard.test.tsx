// @vitest-environment jsdom
import 'vitest-canvas-mock';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { GoldFrameUniforms } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { cardPhase, chapterProgress } from '../scene/choreography';
import { TitleCard } from './TitleCard';
import { createPremiereStore } from './premiereStore';

function findCardRoot(scene: THREE.Object3D, z: number): THREE.Group {
  const root = scene.children.find(
    (child): child is THREE.Group => child instanceof THREE.Group && child.position.z === z
  );
  if (!root) throw new Error(`No card root at z=${z}`);
  return root;
}

function findFrameUniforms(root: THREE.Object3D): GoldFrameUniforms {
  let uniforms: GoldFrameUniforms | undefined;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.userData.uniforms) uniforms = material.userData.uniforms as GoldFrameUniforms;
    }
  });
  if (!uniforms) throw new Error('No gold-frame uniforms below card root');
  return uniforms;
}

function countDisposals(root: THREE.Object3D): { count: () => number } {
  let disposed = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.addEventListener('dispose', () => { disposed += 1; });
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.addEventListener('dispose', () => { disposed += 1; }));
  });
  return { count: () => disposed };
}

describe('TitleCard', () => {
  it('applies the pure card phase to the frame uniforms at t=4.32', async () => {
    const chapter = SEQUENCE_CHAPTERS[0];
    const store = createPremiereStore({ freezeAt: 4.32 });
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} chapter={chapter} variant="standard" cardScale={1} />
    );
    await renderer.advanceFrames(1, 0);
    const root = findCardRoot(renderer.scene.instance, chapter.zPosition);
    const phase = cardPhase({
      localT: chapterProgress({ time: 4.32, chapter }),
      variant: 'standard',
    });
    const uniforms = findFrameUniforms(root);
    expect(root.visible).toBe(true);
    expect(uniforms.uDraw.value).toBeCloseTo(phase.drawProgress);
    expect(uniforms.uPartOpen.value).toBeCloseTo(phase.partOpen);
    expect(uniforms.uOpacity.value).toBeCloseTo(phase.opacity);
    await renderer.unmount();
  });

  it('hides the root beyond the card range and disposes GPU objects on unmount', async () => {
    const chapter = SEQUENCE_CHAPTERS[0];
    const store = createPremiereStore({ freezeAt: null });
    store.setState({ currentTime: chapter.startTime + (chapter.endTime - chapter.startTime) * 1.2 });
    const renderer = await ReactThreeTestRenderer.create(
      <TitleCard store={store} chapter={chapter} variant="standard" cardScale={1} />
    );
    await renderer.advanceFrames(1, 0);
    const root = findCardRoot(renderer.scene.instance, chapter.zPosition);
    expect(root.visible).toBe(false);
    const disposals = countDisposals(root);
    await renderer.unmount();
    expect(disposals.count()).toBeGreaterThan(0);
  });
});
