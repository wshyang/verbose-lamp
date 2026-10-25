// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import type { Camera, PointLight } from 'three';
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { lightRig, rigAnchors } from '../scene/choreography';
import { LightingRig } from './LightingRig';
import { createPremiereStore } from './premiereStore';

const NAMES = ['rig-key', 'rig-rim', 'rig-cool'] as const;

/** Lifts the canvas camera out so a test can read the Z the rig anchors to. */
function CameraProbe({ onCamera }: { onCamera: (camera: Camera) => void }) {
  onCamera(useThree((state) => state.camera));
  return null;
}

async function mount(store = createPremiereStore()) {
  let camera: Camera | undefined;
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <CameraProbe onCamera={(found) => (camera = found)} />
      <LightingRig store={store} />
    </>,
  );
  const light = (name: (typeof NAMES)[number]) =>
    renderer.scene.findByProps({ name }).instance as PointLight;
  return { renderer, light, camera: () => camera as Camera };
}

// The rig's numbers are the Phase 1 choreography functions; these tests check the component
// wires them to the right lights, on the right frame, with the shipped light colours.
describe('LightingRig', () => {
  it('adds the warm ambient wash and the three named point lights', async () => {
    const { renderer, light } = await mount();

    for (const name of NAMES) expect(light(name).type).toBe('PointLight');
    expect(renderer.scene.findAllByType('AmbientLight')).toHaveLength(1);
    await renderer.unmount();
  });

  it('keeps the shipped colours, intensities, distances and falloffs', async () => {
    const { renderer, light } = await mount();

    const [key, rim, cool] = NAMES.map((name) => light(name));
    expect(key.color.getHexString()).toBe('ffdf91');
    expect([key.intensity, key.distance, key.decay]).toEqual([28, 32, 1.5]);
    expect(rim.color.getHexString()).toBe('f5a623');
    expect([rim.intensity, rim.distance, rim.decay]).toEqual([22, 30, 1.5]);
    expect(cool.color.getHexString()).toBe('7da9e8');
    expect([cool.intensity, cool.distance, cool.decay]).toEqual([11, 28, 1.6]);
    await renderer.unmount();
  });

  it('hangs the lights off the camera in cinema mode, at the shader clock’s time', async () => {
    const store = createPremiereStore({ freezeAt: 6 });
    const { renderer, light, camera } = await mount(store);

    await renderer.advanceFrames(1, 0.016);

    const anchors = rigAnchors({
      cameraMode: 'cinema',
      cameraZ: camera().position.z,
      chapterZ: SEQUENCE_CHAPTERS[0].zPosition,
    });
    const expected = lightRig(store.getState().elapsed, anchors.lightZ);
    expect(light('rig-key').position.toArray()).toEqual([...expected.key]);
    expect(light('rig-rim').position.toArray()).toEqual([...expected.rim]);
    expect(light('rig-cool').position.toArray()).toEqual([...expected.cool]);
    await renderer.unmount();
  });

  it('hangs them off the active card in orbit mode, ignoring the camera', async () => {
    const store = createPremiereStore({ freezeAt: SEQUENCE_CHAPTERS[2].startTime + 1 });
    store.getState().setCameraMode('orbit');
    const { renderer, light } = await mount(store);

    await renderer.advanceFrames(1, 0.016);

    const expected = lightRig(store.getState().elapsed, SEQUENCE_CHAPTERS[2].zPosition + 3.5);
    expect(light('rig-key').position.toArray()).toEqual([...expected.key]);
    expect(light('rig-cool').position.z).toBeCloseTo(SEQUENCE_CHAPTERS[2].zPosition + 3.5 - 2, 9);
    await renderer.unmount();
  });

  it('leaves the lights still when the shader clock does not move', async () => {
    const store = createPremiereStore({ freezeAt: 9 });
    const { renderer, light } = await mount(store);

    await renderer.advanceFrames(1, 0.016);
    const first = light('rig-key').position.clone();
    await renderer.advanceFrames(5, 0.016);

    expect(light('rig-key').position.equals(first)).toBe(true);
    await renderer.unmount();
  });

  it('moves the key light when the shader clock moves', async () => {
    const store = createPremiereStore();
    const { renderer, light } = await mount(store);

    await renderer.advanceFrames(1, 0.016);
    const first = light('rig-key').position.clone();
    store.getState().advance(1);
    await renderer.advanceFrames(1, 0.016);

    expect(light('rig-key').position.equals(first)).toBe(false);
    await renderer.unmount();
  });
});
