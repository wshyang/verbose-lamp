// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { PlaybackClock, READY_FRAMES } from './PlaybackClock';
import { createPremiereStore } from './premiereStore';

describe('PlaybackClock', () => {
  it('advances the playhead by the frame delta', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);
    await renderer.advanceFrames(1, 0.016);
    expect(store.getState().currentTime).toBeCloseTo(0.016, 6);
    await renderer.advanceFrames(1, 0.02);
    expect(store.getState().currentTime).toBeCloseTo(0.036, 6);
  });

  it('caps a long frame so a sleeping tab cannot skip an act', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);
    await renderer.advanceFrames(1, 2.5);
    expect(store.getState().currentTime).toBeCloseTo(0.05, 6);
  });

  it('wraps back to the start at the end of the sequence', async () => {
    const store = createPremiereStore();
    store.getState().setTime(TOTAL_SEQUENCE_DURATION - 0.02);
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);
    await renderer.advanceFrames(1, 0.04);
    expect(store.getState().currentTime).toBe(0);
  });

  it('holds a frozen frame and a paused playhead', async () => {
    const frozen = createPremiereStore({ freezeAt: 4.32 });
    const frozenRenderer = await ReactThreeTestRenderer.create(<PlaybackClock store={frozen} />);
    await frozenRenderer.advanceFrames(3, 0.05);
    expect(frozen.getState().currentTime).toBe(4.32);

    const paused = createPremiereStore();
    paused.getState().setPlaying(false);
    const pausedRenderer = await ReactThreeTestRenderer.create(<PlaybackClock store={paused} />);
    await pausedRenderer.advanceFrames(3, 0.05);
    expect(paused.getState().currentTime).toBe(0);
  });

  it('reports a chapter hand-over once, and telemetry every frame', async () => {
    const onChapterChange = vi.fn();
    const onTelemetry = vi.fn();
    const store = createPremiereStore({ onChapterChange, onTelemetry });
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);

    await renderer.advanceFrames(3, 0.016);
    expect(onChapterChange).toHaveBeenCalledTimes(1);
    expect(onChapterChange).toHaveBeenCalledWith(0);
    expect(onTelemetry).toHaveBeenCalledTimes(3);
    expect(onTelemetry).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeChapterIndex: 0, isPlaying: true }),
    );

    store.getState().jumpToChapter(3);
    await renderer.advanceFrames(1, 0.016);
    expect(onChapterChange).toHaveBeenCalledTimes(2);
    expect(onChapterChange).toHaveBeenLastCalledWith(3);
    expect(onTelemetry).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeChapterIndex: 3 }),
    );
  });

  it('flags the host ready on the third frame and reports the act it holds', async () => {
    const onFrameReady = vi.fn();
    const store = createPremiereStore({ onFrameReady });
    store.getState().setPlaying(false);
    store.getState().setTime(SEQUENCE_CHAPTERS[2].startTime + 0.5);
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);

    await renderer.advanceFrames(READY_FRAMES - 1, 0.016);
    expect(onFrameReady).not.toHaveBeenCalled();
    await renderer.advanceFrames(1, 0.016);
    expect(onFrameReady).toHaveBeenCalledTimes(1);
    expect(store.getState().onTelemetry).toBeUndefined();
  });
});
