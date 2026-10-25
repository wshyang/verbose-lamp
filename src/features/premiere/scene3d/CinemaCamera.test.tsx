// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import type { Camera } from 'three';
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, chapterProgress, cinemaCameraZ, clamp } from '../scene/choreography';
import { getCinemaCameraPose, resolveViewportFit } from '../scene/responsiveLayout';
import { CinemaCamera } from './CinemaCamera';
import { createPremiereStore } from './premiereStore';

const DESKTOP = resolveViewportFit(1280, 720, false);
const PHONE = resolveViewportFit(390, 844, true);

function CameraProbe({ onCamera }: { onCamera: (camera: Camera) => void }) {
  onCamera(useThree((state) => state.camera));
  return null;
}

async function mount(store = createPremiereStore(), fit = DESKTOP) {
  let camera: Camera | undefined;
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <CameraProbe onCamera={(found) => (camera = found)} />
      <CinemaCamera store={store} fit={fit} />
    </>,
  );
  return { renderer, camera: () => camera as Camera };
}

// Expected camera positions are the Phase 1 functions evaluated for the same inputs; the
// component is checked for wiring them to the right frame and the right viewport.
describe('CinemaCamera in cinema mode', () => {
  it('rides the corridor path at the playhead', async () => {
    const t = SEQUENCE_CHAPTERS[1].startTime + 2;
    const store = createPremiereStore({ freezeAt: t });
    const { renderer, camera } = await mount(store);

    await renderer.advanceFrames(1, 0.016);

    const index = activeChapterIndex(t, SEQUENCE_CHAPTERS);
    const expectedZ = cinemaCameraZ({
      chapters: SEQUENCE_CHAPTERS,
      activeIdx: index,
      chapterLocal: clamp(chapterProgress(t, SEQUENCE_CHAPTERS[index]), 0, 1),
      pullback: DESKTOP.cameraPullback,
    });
    expect(camera().position.z).toBeCloseTo(expectedZ, 9);
    await renderer.unmount();
  });

  it('applies the pose the viewport and shader clock dictate', async () => {
    const store = createPremiereStore({ freezeAt: 9 });
    const { renderer, camera } = await mount(store);

    await renderer.advanceFrames(1, 0.016);

    const pose = getCinemaCameraPose(DESKTOP, { x: 0, y: 0 }, store.getState().elapsed);
    expect(camera().position.x).toBeCloseTo(pose.x, 9);
    expect(camera().position.y).toBeCloseTo(pose.y, 9);
    expect(camera().rotation.z).toBeCloseTo(pose.roll, 9);
    await renderer.unmount();
  });

  it('pulls back on a narrow viewport', async () => {
    const t = SEQUENCE_CHAPTERS[0].startTime + 1;
    const wide = await mount(createPremiereStore({ freezeAt: t }), DESKTOP);
    await wide.renderer.advanceFrames(1, 0.016);
    const wideZ = wide.camera().position.z;
    await wide.renderer.unmount();

    const narrow = await mount(createPremiereStore({ freezeAt: t }), PHONE);
    await narrow.renderer.advanceFrames(1, 0.016);

    expect(narrow.camera().position.z).toBeGreaterThan(wideZ);
    await narrow.renderer.unmount();
  });

  it('flies forward as the playhead moves through a chapter', async () => {
    const store = createPremiereStore({ freezeAt: 1 });
    const { renderer, camera } = await mount(store);
    await renderer.advanceFrames(1, 0.016);
    const early = camera().position.z;

    store.getState().setTime(6.5);
    await renderer.advanceFrames(1, 0.016);

    expect(camera().position.z).toBeLessThan(early);
    await renderer.unmount();
  });

  it('looks down the corridor with no roll at rest', async () => {
    const { renderer, camera } = await mount(createPremiereStore({ freezeAt: 3 }));

    await renderer.advanceFrames(1, 0.016);

    expect(Number.isFinite(camera().rotation.z)).toBe(true);
    expect(Math.abs(camera().rotation.z)).toBeLessThan(0.05);
    await renderer.unmount();
  });
});

describe('CinemaCamera in orbit mode', () => {
  it('stands the camera off to the side of the active card', async () => {
    const chapter = SEQUENCE_CHAPTERS[1];
    const store = createPremiereStore({ freezeAt: chapter.startTime + 0.2 });
    const { renderer, camera } = await mount(store);

    store.getState().setCameraMode('orbit');
    await renderer.advanceFrames(2, 0.016);

    expect(camera().position.x).toBeCloseTo(2.4, 9);
    expect(camera().position.y).toBeCloseTo(0.9, 9);
    expect(camera().position.z).toBeCloseTo(chapter.zPosition + 9.2, 9);
    await renderer.unmount();
  });

  it('re-applies the orbit view when the same chapter is focused again', async () => {
    const chapter = SEQUENCE_CHAPTERS[2];
    const store = createPremiereStore({
      freezeAt: chapter.startTime + (chapter.endTime - chapter.startTime) * 0.6,
    });
    const { renderer, camera } = await mount(store);
    store.getState().setCameraMode('orbit');
    await renderer.advanceFrames(2, 0.016);

    camera().position.set(9, 9, 9);
    store.getState().focusOrbit(2);
    await renderer.advanceFrames(2, 0.016);

    expect(camera().position.x).toBeCloseTo(2.4, 9);
    expect(camera().position.z).toBeCloseTo(chapter.zPosition + 9.2, 9);
    await renderer.unmount();
  });

  it('stops driving the camera along the corridor while orbiting', async () => {
    const chapter = SEQUENCE_CHAPTERS[1];
    const store = createPremiereStore({ freezeAt: chapter.startTime + 0.2 });
    const { renderer, camera } = await mount(store);
    store.getState().setCameraMode('orbit');
    await renderer.advanceFrames(2, 0.016);
    const orbitZ = camera().position.z;

    store.getState().setTime(chapter.startTime + 3);
    await renderer.advanceFrames(3, 0.016);

    expect(Math.abs(camera().position.z - orbitZ)).toBeLessThan(0.5);
    await renderer.unmount();
  });

  it('returns to the corridor path and an upright camera when orbit ends', async () => {
    const chapter = SEQUENCE_CHAPTERS[1];
    const store = createPremiereStore({ freezeAt: chapter.startTime + 0.2 });
    const { renderer, camera } = await mount(store);
    store.getState().setCameraMode('orbit');
    await renderer.advanceFrames(2, 0.016);
    camera().up.set(0.4, 0.9, 0);

    store.getState().setCameraMode('cinema');
    await renderer.advanceFrames(2, 0.016);

    expect(camera().up.toArray()).toEqual([0, 1, 0]);
    expect(camera().position.z).toBeGreaterThan(chapter.zPosition + 9);
    await renderer.unmount();
  });
});

describe('CinemaCamera lifecycle', () => {
  it('mounts and unmounts cleanly in both modes', async () => {
    const store = createPremiereStore();
    const { renderer } = await mount(store);

    store.getState().setCameraMode('orbit');
    await renderer.advanceFrames(2, 0.016);
    store.getState().setCameraMode('cinema');
    await renderer.advanceFrames(2, 0.016);

    await expect(renderer.unmount()).resolves.not.toThrow();
  });
});
