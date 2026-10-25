// @vitest-environment jsdom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { GoldFrameUniforms } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { cardPhase } from '../scene/choreography';
import { createPremiereStore, type PremiereStore } from './premiereStore';
import { PremiereStoreContext } from './usePremiereStore';
import { TitleCard } from './TitleCard';

/**
 * Scene tests without a GPU (ADDENDUM-022 §7): the test renderer applies
 * useFrame against the real components, so these assert the choreography
 * actually reaches the shader uniforms — the wiring the unit tests can't see.
 */

const MONOGRAM = SEQUENCE_CHAPTERS[0]; // 0.0–7.2 s, z = 0

async function renderCard(store: PremiereStore) {
  const renderer = await ReactThreeTestRenderer.create(
    <PremiereStoreContext.Provider value={store}>
      <TitleCard chapter={MONOGRAM} role="standard" cardScale={1} />
    </PremiereStoreContext.Provider>,
  );
  await renderer.advanceFrames(1, 0.016);
  return renderer;
}

function cardRoot(renderer: Awaited<ReturnType<typeof renderCard>>): THREE.Group {
  let found: THREE.Group | null = null;
  renderer.scene.instance.traverse((obj) => {
    if (obj.userData.frameUniforms) found = obj as THREE.Group;
  });
  if (!found) throw new Error('card root not in scene');
  return found;
}

describe('TitleCard (scene, no GPU)', () => {
  it('applies cardPhase to the frame uniforms at t = 4.32', async () => {
    const store = createPremiereStore();
    store.getState().setTime(4.32);
    const renderer = await renderCard(store);
    const uniforms = cardRoot(renderer).userData.frameUniforms as GoldFrameUniforms;
    const expected = cardPhase({ localT: 4.32 / 7.2, role: 'standard' });
    expect(uniforms.uDraw.value).toBeCloseTo(expected.drawProgress, 6);
    expect(uniforms.uPartOpen.value).toBeCloseTo(expected.partOpen, 6);
    expect(uniforms.uOpacity.value).toBeCloseTo(expected.opacity, 6);
    expect(cardRoot(renderer).position.z).toBe(MONOGRAM.zPosition);
    expect(cardRoot(renderer).visible).toBe(true);
    await renderer.unmount();
  });

  it('is invisible once its chapter has fully passed (localT 1.2)', async () => {
    const store = createPremiereStore();
    store.getState().setTime(7.2 * 1.2);
    const renderer = await renderCard(store);
    expect(cardRoot(renderer).visible).toBe(false);
    await renderer.unmount();
  });

  it('disposes every geometry and material exactly once on unmount', async () => {
    const store = createPremiereStore();
    store.getState().setTime(4.32);
    const renderer = await renderCard(store);
    const disposables = new Set<THREE.BufferGeometry | THREE.Material>();
    cardRoot(renderer).traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        disposables.add(obj.geometry);
        for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
          disposables.add(material);
        }
      }
    });
    expect(disposables.size).toBeGreaterThan(2);
    const spies = [...disposables].map((item) => vi.spyOn(item, 'dispose'));
    await renderer.unmount();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
