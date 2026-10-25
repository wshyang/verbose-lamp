// @vitest-environment jsdom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import type { FrameStyle } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { createPremiereStore, type PremiereStore } from './premiereStore';
import { PremiereStoreContext } from './usePremiereStore';
import { PremiereScene } from './PremiereScene';

// Both need a real WebGL context (PMREM / render targets), so the scene
// composition is tested without them (ADDENDUM-022 §7).
vi.mock('./BallroomEnvironment', () => ({ BallroomEnvironment: () => null }));
vi.mock('./CinemaComposer', () => ({ CinemaComposer: () => null }));

// jsdom has no matchMedia; the viewport fit assumes a fine-pointer desktop.
window.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

/**
 * Scene tests without a GPU (ADDENDUM-022 §7): mount the whole stage and
 * assert its structure — card roots, hero remount isolation, frame-style
 * coalescing, border gating — what only the composed tree can prove.
 */

let probedCamera: THREE.Camera | null = null;
function CameraProbe() {
  probedCamera = useThree((state) => state.camera);
  return null;
}

async function renderScene(store: PremiereStore) {
  probedCamera = null;
  const renderer = await ReactThreeTestRenderer.create(
    <PremiereStoreContext.Provider value={store}>
      <CameraProbe />
      <PremiereScene onTelemetry={vi.fn()} onChapterChange={vi.fn()} onFrameReady={vi.fn()} />
    </PremiereStoreContext.Provider>,
  );
  await renderer.advanceFrames(1, 0.016);
  return renderer;
}

type Renderer = Awaited<ReturnType<typeof renderScene>>;

/** Card roots are the groups carrying the frame-uniforms introspection stamp. */
function cardRoots(renderer: Renderer): THREE.Group[] {
  const roots: THREE.Group[] = [];
  renderer.scene.instance.traverse((obj) => {
    if (obj.userData.frameUniforms) roots.push(obj as THREE.Group);
  });
  return roots.sort((a, b) => b.position.z - a.position.z);
}

function frameGeometryOf(root: THREE.Group): THREE.BufferGeometry {
  let found: THREE.BufferGeometry | null = null;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry.getAttribute('aPathData')) {
      found = obj.geometry;
    }
  });
  if (!found) throw new Error('frame geometry not found');
  return found;
}

function styleWith(store: PremiereStore, intricacy: number): FrameStyle {
  const current = store.getState().frameStyle;
  return {
    intricacy,
    formula: {
      ...current.formula,
      genome: { ...current.formula.genome },
      layers: current.formula.layers?.map((layer) => ({ ...layer })),
    },
  };
}

/** The border group parents itself to the camera; find it by its depth-blind mesh. */
function borderGroup(): THREE.Object3D {
  let found: THREE.Object3D | null = null;
  probedCamera?.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !(obj.material as THREE.Material).depthTest) {
      found = obj.parent;
    }
  });
  if (!found) throw new Error('screen border not attached to camera');
  return found;
}

describe('PremiereScene (scene, no GPU)', () => {
  it('mounts five card roots at the chapter z-positions', async () => {
    const store = createPremiereStore();
    const renderer = await renderScene(store);
    const roots = cardRoots(renderer);
    expect(roots).toHaveLength(SEQUENCE_CHAPTERS.length);
    expect(roots.map((root) => root.position.z)).toEqual(
      SEQUENCE_CHAPTERS.map((chapter) => chapter.zPosition),
    );
    await renderer.unmount();
  });

  it('replaces exactly the hero root when heroConfig changes', async () => {
    const store = createPremiereStore();
    const renderer = await renderScene(store);
    const before = new Map(cardRoots(renderer).map((root) => [root.position.z, root.uuid]));
    await ReactThreeTestRenderer.act(async () => {
      store.getState().updateHeroTitle({ ...store.getState().heroConfig, mainTitle: 'GATSBY!' });
    });
    await renderer.advanceFrames(1, 0.016);
    const after = cardRoots(renderer);
    expect(after).toHaveLength(SEQUENCE_CHAPTERS.length);
    const replaced = after.filter((root) => before.get(root.position.z) !== root.uuid);
    expect(replaced).toHaveLength(1);
    expect(replaced[0].position.z).toBe(-108); // the hero chapter
    await renderer.unmount();
  });

  it('coalesces two frame-style changes in one frame into one geometry rebuild', async () => {
    const store = createPremiereStore();
    const renderer = await renderScene(store);
    const heroRoot = cardRoots(renderer).find((root) => root.position.z === -108);
    if (!heroRoot) throw new Error('hero root missing');
    const previous = frameGeometryOf(heroRoot);
    const disposeSpy = vi.spyOn(previous, 'dispose');
    store.getState().setSequenceFrameStyle(styleWith(store, 0.9));
    store.getState().setSequenceFrameStyle(styleWith(store, 0.3));
    await renderer.advanceFrames(1, 0.016);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    const rebuilt = frameGeometryOf(heroRoot);
    expect(rebuilt).not.toBe(previous);
    await renderer.advanceFrames(1, 0.016); // nothing pending: no second rebuild
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(frameGeometryOf(heroRoot)).toBe(rebuilt);
    await renderer.unmount();
  });

  it('shows the screen border only when isBorderEnabled', async () => {
    const store = createPremiereStore();
    const renderer = await renderScene(store);
    expect(borderGroup().visible).toBe(false);
    store.getState().setScreenBorderEnabled(true);
    expect(borderGroup().visible).toBe(true);
    store.getState().setScreenBorderEnabled(false);
    expect(borderGroup().visible).toBe(false);
    await renderer.unmount();
  });
});
