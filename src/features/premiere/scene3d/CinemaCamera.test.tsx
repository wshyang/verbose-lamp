// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, cinemaCameraZ } from '../scene/choreography';
import { orbitFocusPlan } from '../scene/orbitFocus';
import { getCinemaCameraPose, resolveViewportFit } from '../scene/responsiveLayout';
import { createPremiereStore } from './premiereStore';
import { CinemaCamera } from './CinemaCamera';

/**
 * The camera without a canvas (ADDENDUM-022 §7). `OrbitControls` is the only part that
 * needs a real GL context, so it is recorded: the suite's job is to prove that cinema mode
 * puts the camera exactly where `choreography` + `responsiveLayout` say, and that an orbit
 * hand-off re-frames the act that is on screen.
 */
const controls = vi.hoisted(() => ({
  instances: [] as Array<{
    target: THREE.Vector3;
    enabled: boolean;
    updates: number;
    update: () => void;
    dispose: () => void;
  }>,
}));

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = new THREE.Vector3();
    enabled = true;
    enableDamping = false;
    dampingFactor = 0;
    minDistance = 0;
    maxDistance = 0;
    updates = 0;
    update = () => {
      (this as unknown as { updates: number }).updates += 1;
    };
    dispose = () => undefined;
    constructor() {
      controls.instances.push(this as unknown as (typeof controls.instances)[number]);
    }
  },
}));

const FIT = resolveViewportFit(1440, 900, false);
const round = (value: number) => Math.round(value * 1000) / 1000;

/** The renderer's own camera, which R3F keeps outside the scene in the test harness. */
function captureCamera(sink: { camera: THREE.PerspectiveCamera | null }) {
  return function CaptureCamera() {
    sink.camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
    return null;
  };
}

async function mount(store = createPremiereStore()) {
  const sink: { camera: THREE.PerspectiveCamera | null } = { camera: null };
  const Capture = captureCamera(sink);
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <CinemaCamera store={store} fit={FIT} />
      <Capture />
    </>,
    { width: 1440, height: 900 }
  );
  return {
    renderer,
    store,
    camera: sink.camera as unknown as THREE.PerspectiveCamera,
    controls: controls.instances[controls.instances.length - 1],
  };
}

describe('CinemaCamera', () => {
  beforeEach(() => {
    controls.instances.length = 0;
  });

  it('places the camera where the choreography says, act by act', async () => {
    const { renderer, store, camera } = await mount();

    await renderer.advanceFrames(1, 0.016);

    const index = activeChapterIndex(store.getState().currentTime, SEQUENCE_CHAPTERS);
    const chapter = SEQUENCE_CHAPTERS[index];
    const local = Math.min(
      1,
      Math.max(
        0,
        (store.getState().currentTime - chapter.startTime) / (chapter.endTime - chapter.startTime)
      )
    );
    const expectedZ = cinemaCameraZ({
      chapters: SEQUENCE_CHAPTERS,
      activeIdx: index,
      chapterLocal: local,
      pullback: FIT.cameraPullback,
    });
    const pose = getCinemaCameraPose(FIT, { x: 0, y: 0 }, store.getState().elapsed);

    expect(round(camera.position.z)).toBe(round(expectedZ));
    // The idle drift is a fraction of a world unit at frame one.
    expect(Math.abs(camera.position.x - pose.x)).toBeLessThan(0.15);
    expect(Math.abs(camera.position.y - pose.y)).toBeLessThan(0.15);
    expect(camera.rotation.z).toBeCloseTo(pose.roll, 9);
    await renderer.unmount();
  });

  it('starts the orbit controls disabled and disposes them on unmount', async () => {
    const { renderer, controls: instance } = await mount();
    const dispose = vi.spyOn(instance, 'dispose');

    expect(instance.enabled).toBe(false);

    await renderer.unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('enables the controls and re-frames the act on an orbit hand-off', async () => {
    const { renderer, store, controls: instance } = await mount();
    const chapter = SEQUENCE_CHAPTERS[2];
    const plan = orbitFocusPlan(store.getState().currentTime, chapter);

    await ReactThreeTestRenderer.act(async () => {
      store.getState().jumpToChapter(2);
      store.getState().setCameraMode('orbit');
    });

    expect(instance.enabled).toBe(true);
    if (plan.time !== null) expect(store.getState().currentTime).toBeCloseTo(plan.time, 9);
    expect(instance.target.toArray()).toEqual(plan.target);
    await renderer.unmount();
  });

  it('lets the controls own the camera while orbit mode is on', async () => {
    const { renderer, store, controls: instance } = await mount();
    await ReactThreeTestRenderer.act(async () => {
      store.getState().setCameraMode('orbit');
    });
    const before = instance.updates;

    await renderer.advanceFrames(2, 0.016);

    expect(instance.updates).toBeGreaterThan(before);
    await renderer.unmount();
  });

  it('falls back to the first act when the orbit target is out of range', async () => {
    const { renderer, store, controls: instance } = await mount();

    await ReactThreeTestRenderer.act(async () => {
      store.setState({ cameraMode: 'orbit', orbitTargetChapter: 99 });
    });

    const plan = orbitFocusPlan(store.getState().currentTime, SEQUENCE_CHAPTERS[0]);
    expect(instance.target.toArray()).toEqual(plan.target);
    await renderer.unmount();
  });

  it('keeps the world up axis when the film returns to cinema mode', async () => {
    const { renderer, store, camera } = await mount();
    await ReactThreeTestRenderer.act(async () => {
      store.getState().setCameraMode('orbit');
    });
    camera.up.set(1, 0, 0);

    await ReactThreeTestRenderer.act(async () => {
      store.getState().setCameraMode('cinema');
    });

    expect(camera.up.toArray()).toEqual([0, 1, 0]);
    await renderer.unmount();
  });
});
