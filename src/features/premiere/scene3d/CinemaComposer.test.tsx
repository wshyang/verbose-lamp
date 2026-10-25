// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer, { act } from '@react-three/test-renderer';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { nitrateStrength } from '../scene/choreography';
import { CinemaComposer } from './CinemaComposer';
import { createPremiereStore } from './premiereStore';

const pipeline = vi.hoisted(() => ({
  setSize: vi.fn(),
  setNitrate: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  created: [] as Array<{ width: number; height: number }>,
}));

vi.mock('./composer', () => ({
  createCinemaComposer: (
    _gl: unknown,
    _scene: unknown,
    _camera: unknown,
    width: number,
    height: number,
  ) => {
    pipeline.created.push({ width, height });
    return pipeline;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  pipeline.created.length = 0;
});

async function render(store = createPremiereStore({ freezeAt: 4.32 })) {
  const renderer = await ReactThreeTestRenderer.create(<CinemaComposer store={store} />);
  await renderer.advanceFrames(1, 0.016);
  return { renderer, store };
}

describe('CinemaComposer', () => {
  it('builds one composer for the live renderer, scene and camera', async () => {
    await render();
    expect(pipeline.created).toHaveLength(1);
    expect(pipeline.created[0].width).toBeGreaterThan(0);
    expect(pipeline.created[0].height).toBeGreaterThan(0);
    expect(pipeline.setSize).toHaveBeenCalledWith(
      pipeline.created[0].width,
      pipeline.created[0].height,
    );
  });

  it('feeds the nitrate mix and its clock, then renders — once per frame', async () => {
    const { renderer, store } = await render();
    const state = store.getState();
    expect(pipeline.setNitrate).toHaveBeenLastCalledWith(4.32, nitrateStrength(state.currentTime, false));
    expect(pipeline.render).toHaveBeenCalledTimes(1);

    act(() => store.getState().setNitrateMode(true));
    await renderer.advanceFrames(1, 0.016);
    expect(pipeline.setNitrate).toHaveBeenLastCalledWith(
      4.32,
      nitrateStrength(store.getState().currentTime, true),
    );
    expect(pipeline.render).toHaveBeenCalledTimes(2);
  });

  it('uses the sequence time for the nitrate ramp and the frozen time for the shader', async () => {
    const { renderer, store } = await render(createPremiereStore({ freezeAt: 33.8 }));
    act(() => store.getState().setTime(1));
    await renderer.advanceFrames(1, 0.016);
    expect(pipeline.setNitrate).toHaveBeenLastCalledWith(33.8, nitrateStrength(1, false));
  });

  it('disposes the pipeline on unmount', async () => {
    const { renderer } = await render();
    await renderer.unmount();
    expect(pipeline.dispose).toHaveBeenCalledTimes(1);
  });

  it('covers every act of the sequence', async () => {
    const { renderer, store } = await render(createPremiereStore());
    for (const chapter of SEQUENCE_CHAPTERS) {
      act(() => store.getState().setTime(chapter.startTime + 0.2));
      await renderer.advanceFrames(1, 0.016);
    }
    expect(pipeline.render).toHaveBeenCalledTimes(SEQUENCE_CHAPTERS.length + 1);
  });
});
