// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { activeChapterIndex } from '../scene/choreography';
import { FRAME_READY_COUNT, MAX_FRAME_STEP_S, PlaybackClock, TELEMETRY_INTERVAL_MS } from './PlaybackClock';
import { createPremiereStore } from './premiereStore';

/**
 * The clock owns time (ADDENDUM-022 §2.3), so these are the assertions that make
 * every other frame-driven component trustworthy: one advance per frame, no
 * runaway after a tab regains focus, a clean wrap, and one chapter handover each
 * time the playhead crosses a boundary.
 */

async function mountClock(options: { freezeAt?: number; isPlaying?: boolean; time?: number } = {}) {
  const store = createPremiereStore({ freezeAt: options.freezeAt });
  if (options.time !== undefined) store.getState().setTime(options.time);
  if (options.isPlaying !== undefined) store.getState().setPlaying(options.isPlaying);
  const onChapterChange = vi.fn();
  const onFrameReady = vi.fn();
  const onTelemetry = vi.fn();
  const renderer = await ReactThreeTestRenderer.create(
    <PlaybackClock
      store={store}
      onChapterChange={onChapterChange}
      onFrameReady={onFrameReady}
      onTelemetry={onTelemetry}
    />
  );
  return { store, renderer, onChapterChange, onFrameReady, onTelemetry };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PlaybackClock', () => {
  it('advances by the frame delta while playing', async () => {
    const { store, renderer } = await mountClock({ isPlaying: true, time: 1 });
    await renderer.advanceFrames(3, 0.016);
    expect(store.getState().currentTime).toBeCloseTo(1 + 3 * 0.016, 6);
  });

  it('caps a long frame step so a backgrounded tab does not jump the film', async () => {
    const { store, renderer } = await mountClock({ isPlaying: true, time: 0 });
    // Half a second of stall: the clock accepts only MAX_FRAME_STEP_S of it.
    await renderer.advanceFrames(1, 0.5);
    expect(store.getState().currentTime).toBeCloseTo(MAX_FRAME_STEP_S, 6);
  });

  it('wraps to the top at the end of the sequence', async () => {
    const { store, renderer } = await mountClock({ isPlaying: true, time: TOTAL_SEQUENCE_DURATION - 0.01 });
    await renderer.advanceFrames(1, MAX_FRAME_STEP_S);
    expect(store.getState().currentTime).toBe(0);
  });

  it('does not advance while paused', async () => {
    const { store, renderer } = await mountClock({ isPlaying: false, time: 2 });
    await renderer.advanceFrames(4, 0.016);
    expect(store.getState().currentTime).toBe(2);
  });

  it('pins the playhead to freezeAt and never animates', async () => {
    const { store, renderer } = await mountClock({ freezeAt: 33.8, isPlaying: true, time: 0 });
    await renderer.advanceFrames(6, 0.5);
    expect(store.getState().currentTime).toBe(0);
    expect(store.getState().elapsed).toBe(33.8);
  });

  it('reports the container ready after the promised number of frozen frames', async () => {
    const { renderer, onFrameReady } = await mountClock({ freezeAt: 4.32 });
    await renderer.advanceFrames(FRAME_READY_COUNT - 1, 0.016);
    expect(onFrameReady).not.toHaveBeenCalled();
    await renderer.advanceFrames(1, 0.016);
    expect(onFrameReady).toHaveBeenCalledTimes(1);
    // Later frames do not announce again.
    await renderer.advanceFrames(2, 0.016);
    expect(onFrameReady).toHaveBeenCalledTimes(1);
  });

  it('announces each chapter handover exactly once', async () => {
    const secondAct = SEQUENCE_CHAPTERS[1];
    const { renderer, onChapterChange, store } = await mountClock({ isPlaying: false, time: 0 });
    store.getState().setTime(secondAct.startTime + 0.1);
    await renderer.advanceFrames(1, 0.016);
    expect(onChapterChange).toHaveBeenCalledTimes(1);
    expect(onChapterChange).toHaveBeenLastCalledWith(1);

    await renderer.advanceFrames(3, 0.016);
    // Same chapter: the callback is not repeated frame after frame.
    expect(onChapterChange).toHaveBeenCalledTimes(1);
  });

  it('throttles telemetry to one report per interval', async () => {
    let now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { renderer, onTelemetry, store } = await mountClock({ isPlaying: true, time: 0 });

    await renderer.advanceFrames(1, 0.016);
    expect(onTelemetry).toHaveBeenCalledTimes(1);

    now += TELEMETRY_INTERVAL_MS - 1;
    await renderer.advanceFrames(1, 0.016);
    expect(onTelemetry).toHaveBeenCalledTimes(1);

    now += 2;
    await renderer.advanceFrames(1, 0.016);
    expect(onTelemetry).toHaveBeenCalledTimes(2);
    expect(onTelemetry).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeChapterIndex: activeChapterIndex(store.getState().currentTime, SEQUENCE_CHAPTERS) })
    );
  });

  it('reports the chapter it just moved into', async () => {
    const { renderer, onTelemetry } = await mountClock({ isPlaying: false, time: 18.08 });
    await renderer.advanceFrames(1, 0.016);
    expect(onTelemetry).toHaveBeenCalledWith(expect.objectContaining({ activeChapterIndex: 2, isPlaying: false }));
  });
});
