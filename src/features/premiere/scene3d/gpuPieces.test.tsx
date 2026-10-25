// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// The post pipeline and the environment bake need a GPU, so they are doubled at their
// module seams. What is under test is the components around them: when they build, what
// they feed per frame, and that they release what they made.
const gpu = vi.hoisted(() => ({
  pipelines: [] as Array<{
    size: Array<[number, number]>;
    nitrate: Array<[number, number]>;
    renders: number;
    disposed: number;
  }>,
  environments: [] as Array<{ disposed: number }>,
}));

vi.mock('./composer', () => ({
  createCinemaComposer: (
    _gl: unknown,
    _scene: unknown,
    _camera: unknown,
    width: number,
    height: number,
  ) => {
    const record = {
      size: [[width, height]] as Array<[number, number]>,
      nitrate: [] as Array<[number, number]>,
      renders: 0,
      disposed: 0,
    };
    gpu.pipelines.push(record);
    return {
      render: () => {
        record.renders += 1;
      },
      setSize: (w: number, h: number) => record.size.push([w, h]),
      setNitrate: (time: number, amount: number) => record.nitrate.push([time, amount]),
      dispose: () => {
        record.disposed += 1;
      },
    };
  },
}));

vi.mock('../scene/environment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scene/environment')>();
  return {
    ...actual,
    createBallroomEnvironment: () => {
      const texture = new THREE.Texture();
      const record = { disposed: 0 };
      texture.addEventListener('dispose', () => {
        record.disposed += 1;
      });
      gpu.environments.push(record);
      return texture;
    },
  };
});

import { nitrateLevel } from '../scene/choreography';
import { BallroomEnvironment } from './BallroomEnvironment';
import { CinemaComposer } from './CinemaComposer';
import { createPremiereStore } from './premiereStore';

describe('CinemaComposer', () => {
  it('builds one pipeline at the canvas size', async () => {
    gpu.pipelines.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<CinemaComposer store={createPremiereStore()} />);

    expect(gpu.pipelines).toHaveLength(1);
    expect(gpu.pipelines[0].size[0][0]).toBeGreaterThan(0);
    await renderer.unmount();
  });

  it('is the only thing that renders: one composite per frame', async () => {
    gpu.pipelines.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<CinemaComposer store={createPremiereStore()} />);

    await renderer.advanceFrames(5, 0.016);

    expect(gpu.pipelines[0].renders).toBe(5);
    await renderer.unmount();
  });

  // R3F renders the scene itself unless some frame callback holds a positive priority. With
  // the composer drawing too, every frame would be drawn twice, the second time without the
  // post chain on top. The subscription count of positive-priority callbacks is how R3F
  // decides, and it is the number this component exists to make non-zero.
  it('holds a positive frame priority, so R3F does not render the scene a second time', async () => {
    gpu.pipelines.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<CinemaComposer store={createPremiereStore()} />);

    const internal = (renderer.scene.instance as unknown as { __r3f?: { root: { getState: () => { internal: { priority: number } } } } }).__r3f;
    expect(internal?.root.getState().internal.priority).toBeGreaterThan(0);
    await renderer.unmount();
  });

  it('feeds the shader clock and the automatic nitrate opening', async () => {
    gpu.pipelines.length = 0;
    const store = createPremiereStore({ freezeAt: 1.45 });
    const renderer = await ReactThreeTestRenderer.create(<CinemaComposer store={store} />);

    await renderer.advanceFrames(1, 0.016);

    expect(gpu.pipelines[0].nitrate.at(-1)).toEqual([1.45, nitrateLevel(1.45, 'auto')]);
    await renderer.unmount();
  });

  it('forces the 1920s look when the toggle is on, at any time', async () => {
    gpu.pipelines.length = 0;
    const store = createPremiereStore({ freezeAt: 20 });
    store.getState().setNitrateMode(true);
    const renderer = await ReactThreeTestRenderer.create(<CinemaComposer store={store} />);

    await renderer.advanceFrames(1, 0.016);

    expect(gpu.pipelines[0].nitrate.at(-1)).toEqual([20, 0.92]);
    await renderer.unmount();
  });

  it('switches the look off again when the toggle goes off', async () => {
    gpu.pipelines.length = 0;
    const store = createPremiereStore({ freezeAt: 20 });
    store.getState().setNitrateMode(true);
    const renderer = await ReactThreeTestRenderer.create(<CinemaComposer store={store} />);
    await renderer.advanceFrames(1, 0.016);

    store.getState().setNitrateMode(false);
    await renderer.advanceFrames(1, 0.016);

    expect(gpu.pipelines[0].nitrate.at(-1)).toEqual([20, 0]);
    await renderer.unmount();
  });

  it('disposes the pipeline exactly once on unmount', async () => {
    gpu.pipelines.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<CinemaComposer store={createPremiereStore()} />);

    await renderer.unmount();

    expect(gpu.pipelines[0].disposed).toBe(1);
  });
});

describe('BallroomEnvironment', () => {
  it('bakes the environment once', async () => {
    gpu.environments.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<BallroomEnvironment />);

    expect(gpu.environments).toHaveLength(1);
    await renderer.unmount();
  });

  it('releases the texture on unmount', async () => {
    gpu.environments.length = 0;
    const renderer = await ReactThreeTestRenderer.create(<BallroomEnvironment />);

    await renderer.unmount();

    expect(gpu.environments[0].disposed).toBe(1);
  });
});
