// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useThree } from '@react-three/fiber';
import { DEFAULT_FRAME_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '../data/sequence';
import { PremiereStage } from './PremiereStage';
import { createPremiereStore } from './premiereStore';

/**
 * The composed scene without the GPU (ADDENDUM-022 Phase 3, ADDENDUM-029 §2).
 * `PremiereStage` is exactly the part of `PremiereScene` that does not need WebGL:
 * the clock, the five card rigs, the camera, the border and the atmosphere. The
 * environment map and the post chain stay outside it, so they are tested where
 * they can be — nowhere, honestly, until a browser runs the e2e suite.
 */

/**
 * Production keeps the camera in the graph (`applyRendererLook` does
 * `scene.add(camera)`), because the screen border is parented to it. The test
 * renderer has no `onCreated` hook, so the probe below stands in for that line and
 * hands the camera back to the assertions.
 */
function cameraProbe(onCamera: (camera: THREE.Camera) => void) {
  return function CameraProbe() {
    onCamera(useThree((state) => state.camera));
    return null;
  };
}

function cardRoots(renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>): THREE.Object3D[] {
  return SEQUENCE_CHAPTERS.map((chapter) => renderer.scene.instance.getObjectByName(`card:${chapter.id}`)).filter(
    (root): root is THREE.Object3D => root !== undefined
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PremiereStage', () => {
  it('mounts one card per chapter at its own depth', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PremiereStage store={store} />);

    const roots = cardRoots(renderer);
    expect(roots).toHaveLength(SEQUENCE_CHAPTERS.length);
    roots.forEach((root, index) => {
      expect(root.position.z).toBeCloseTo(SEQUENCE_CHAPTERS[index].zPosition, 6);
    });
  });

  it('replaces only the hero card when the title changes', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PremiereStage store={store} />);
    const before = cardRoots(renderer);
    const heroIndex = SEQUENCE_CHAPTERS.findIndex((chapter) => chapter.archetype === 'gatsby_hero');

    store.getState().setHeroConfig({ ...DEFAULT_HERO_TITLE, mainTitle: 'CARRAWAY' });
    await renderer.update(<PremiereStage store={store} />);

    const after = cardRoots(renderer);
    expect(after).toHaveLength(before.length);
    // The hero rig is a new object; every other rig kept its identity, so no
    // geometry was rebuilt for the four cards that did not change.
    expect(after[heroIndex]).not.toBe(before[heroIndex]);
    after.forEach((root, index) => {
      if (index !== heroIndex) expect(root).toBe(before[index]);
    });
  });

  it('shows the screen border only while it is enabled', async () => {
    const store = createPremiereStore();
    let camera: THREE.Camera | null = null;
    const Probe = cameraProbe((next) => {
      camera = next;
    });
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <Probe />
        <PremiereStage store={store} />
      </>
    );

    const border = (camera as unknown as THREE.Object3D).getObjectByName('screen-border') as THREE.Group;
    expect(border).toBeDefined();
    expect(border.visible).toBe(false);

    store.getState().setScreenBorderEnabled(true);
    await renderer.update(
      <>
        <Probe />
        <PremiereStage store={store} />
      </>
    );
    expect(border.visible).toBe(true);

    store.getState().setScreenBorderEnabled(false);
    await renderer.update(
      <>
        <Probe />
        <PremiereStage store={store} />
      </>
    );
    expect(border.visible).toBe(false);
  });

  it('hands the border a new style without rebuilding its rig', async () => {
    const store = createPremiereStore();
    let camera: THREE.Camera | null = null;
    const Probe = cameraProbe((next) => {
      camera = next;
    });
    const render = () => (
      <>
        <Probe />
        <PremiereStage store={store} />
      </>
    );
    const renderer = await ReactThreeTestRenderer.create(render());
    const border = (camera as unknown as THREE.Object3D).getObjectByName('screen-border') as THREE.Group;
    const replaced = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    store.getState().setScreenBorderEnabled(true);
    await renderer.update(render());
    replaced.mockClear();

    store.getState().setScreenBorderStyle({ weight: 0.8, genome: { ...SIGNATURE_GENOME, wingDelta: 3 } });
    await renderer.update(render());

    // Same rig, re-styled in place: the rig disposes exactly the geometry it drops.
    expect((camera as unknown as THREE.Object3D).getObjectByName('screen-border')).toBe(border);
    expect(replaced).toHaveBeenCalledTimes(1);
  });

  it('drives the cards from the clock in one pass per frame', async () => {
    const store = createPremiereStore();
    store.getState().setPlaying(true);
    const renderer = await ReactThreeTestRenderer.create(<PremiereStage store={store} />);
    const start = store.getState().currentTime;

    await renderer.advanceFrames(2, 0.016);
    // The clock ran before the cards, so both advanced from the same playhead.
    expect(store.getState().currentTime).toBeCloseTo(start + 0.032, 6);
    expect(store.getState().activeChapterIndex).toBe(0);
  });

  it('keeps the cards and the border alive across a style change', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PremiereStage store={store} />);
    store.getState().setSequenceFrameStyle({
      intricacy: DEFAULT_FRAME_STYLE.intricacy,
      formula: { ...DEFAULT_FRAME_STYLE.formula, genome: { ...SIGNATURE_GENOME, rayReach: 1.2 } },
    });
    await renderer.advanceFrames(1, 0.016);
    expect(cardRoots(renderer)).toHaveLength(SEQUENCE_CHAPTERS.length);
  });

  it('survives orbit mode, which re-parents the camera target', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PremiereStage store={store} />);
    store.getState().setCameraMode('orbit');
    await renderer.update(<PremiereStage store={store} />);
    await renderer.advanceFrames(2, 0.016);
    expect(cardRoots(renderer)).toHaveLength(SEQUENCE_CHAPTERS.length);
  });
});
