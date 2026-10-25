// @vitest-environment jsdom
import 'vitest-canvas-mock';
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { PlaybackClock } from './PlaybackClock';
import { createPremiereStore } from './premiereStore';

describe('PlaybackClock', () => {
  it('does not advance frozen time and marks readiness after three frames', async () => {
    const onChapterChange = vi.fn();
    const store = createPremiereStore({ freezeAt: 4.32, onChapterChange });
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);
    await renderer.advanceFrames(3, 1 / 30);
    expect(store.getState().currentTime).toBe(4.32);
    expect(store.getState().frameReady).toBe(true);
    expect(onChapterChange).toHaveBeenCalledTimes(1);
    expect(onChapterChange).toHaveBeenCalledWith(0);
    await renderer.unmount();
  });

  it('advances with capped delta and wraps at the sequence end', async () => {
    const store = createPremiereStore({ freezeAt: null });
    store.getState().setTime(37.99);
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);
    await renderer.advanceFrames(1, 1);
    expect(store.getState().currentTime).toBe(0);
    await renderer.unmount();
  });

  it('does not advance a paused live clock', async () => {
    const store = createPremiereStore({ freezeAt: null });
    store.getState().setTime(2);
    store.getState().setPlaying(false);
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);
    await renderer.advanceFrames(2, 0.5);
    expect(store.getState().currentTime).toBe(2);
    await renderer.unmount();
  });

  it('fires a chapter handover exactly once', async () => {
    const onChapterChange = vi.fn();
    const onTelemetry = vi.fn();
    const store = createPremiereStore({ freezeAt: null, onChapterChange, onTelemetry });
    store.getState().setTime(7.18);
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);
    await renderer.advanceFrames(3, 0.02);
    expect(onChapterChange.mock.calls).toEqual([[0], [1]]);
    expect(onTelemetry).toHaveBeenCalled();
    await renderer.unmount();
  });
});
