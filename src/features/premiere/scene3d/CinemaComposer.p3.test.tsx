// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import 'vitest-canvas-mock';

import { describe, expect, it, vi, beforeEach } from 'vitest';

import ReactThreeTestRenderer, { act } from '@react-three/test-renderer';

import { CinemaComposer } from './CinemaComposer';

import { createPremiereStore } from './premiereStore';

import { SEQUENCE_CHAPTERS } from '../data/sequence';

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
