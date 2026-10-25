// @vitest-environment jsdom
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { PlaybackClock } from './PlaybackClock';
import { createPremiereStore } from './premiereStore';

// The clock, mounted for real: `advanceFrames` runs `useFrame`, so this is the renderer's
// own loop rather than a fake timer.
describe('PlaybackClock', () => {
  it('advances the film and the shader clock while playing', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);

    await renderer.advanceFrames(10, 0.016);

    expect(store.getState().currentTime).toBeGreaterThan(0);
    expect(store.getState().elapsed).toBeGreaterThan(0);
    await renderer.unmount();
  });

  it('never moves a frozen scene, and pins its shader clock to the frozen moment', async () => {
    const store = createPremiereStore({ freezeAt: 12.5 });
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);

    await renderer.advanceFrames(10, 0.016);

    expect(store.getState().currentTime).toBe(12.5);
    expect(store.getState().elapsed).toBe(12.5);
    await renderer.unmount();
  });

  it('holds a paused film but keeps the shaders moving', async () => {
    const store = createPremiereStore();
    store.getState().setPlaying(false);
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);

    await renderer.advanceFrames(5, 0.016);

    expect(store.getState().currentTime).toBe(0);
    expect(store.getState().elapsed).toBeGreaterThan(0);
    await renderer.unmount();
  });

  it('wraps the film at its end rather than stopping on the last frame', async () => {
    const store = createPremiereStore();
    store.getState().setTime(TOTAL_SEQUENCE_DURATION - 0.02);
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);

    await renderer.advanceFrames(5, 0.016);

    expect(store.getState().currentTime).toBeLessThan(1);
    await renderer.unmount();
  });
});

describe('PlaybackClock chapter hand-overs', () => {
  it('reports a hand-over once, not once per frame', async () => {
    const store = createPremiereStore();
    const onChapterChange = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <PlaybackClock store={store} onChapterChange={onChapterChange} />,
    );

    await renderer.advanceFrames(4, 0.016);
    expect(onChapterChange).toHaveBeenCalledTimes(1);
    expect(onChapterChange).toHaveBeenLastCalledWith(0);

    store.getState().setTime(20);
    await renderer.advanceFrames(4, 0.016);
    expect(onChapterChange).toHaveBeenCalledTimes(2);
    expect(onChapterChange).toHaveBeenLastCalledWith(2);
    await renderer.unmount();
  });

  it('records the active chapter in the store for the rest of the scene to read', async () => {
    const store = createPremiereStore();
    store.getState().setTime(20);
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);

    await renderer.advanceFrames(2, 0.016);

    expect(store.getState().activeChapterIndex).toBe(2);
    await renderer.unmount();
  });
});

describe('PlaybackClock telemetry', () => {
  it('throttles to one report per interval, and always reports the first', async () => {
    const store = createPremiereStore();
    const onTelemetry = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <PlaybackClock store={store} onTelemetry={onTelemetry} telemetryIntervalMs={10_000} />,
    );

    await renderer.advanceFrames(30, 0.016);

    expect(onTelemetry).toHaveBeenCalledTimes(1);
    expect(onTelemetry.mock.calls[0][0]).toMatchObject({ activeChapterIndex: 0, isPlaying: true });
    await renderer.unmount();
  });

  it('reports every frame when the interval is zero', async () => {
    const store = createPremiereStore();
    const onTelemetry = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <PlaybackClock store={store} onTelemetry={onTelemetry} telemetryIntervalMs={0} />,
    );

    await renderer.advanceFrames(6, 0.016);

    expect(onTelemetry).toHaveBeenCalledTimes(6);
    await renderer.unmount();
  });

  it('reports the playhead and the transport state it read after advancing', async () => {
    const store = createPremiereStore();
    store.getState().setPlaying(false);
    const onTelemetry = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <PlaybackClock store={store} onTelemetry={onTelemetry} telemetryIntervalMs={0} />,
    );

    await renderer.advanceFrames(1, 0.016);

    expect(onTelemetry).toHaveBeenCalledWith({ currentTime: 0, activeChapterIndex: 0, isPlaying: false });
    await renderer.unmount();
  });
});

// The scene reports itself ready for a screenshot after three composited frames. The
// likeness gate waits on it for frozen frames, and the end-to-end flows wait on it for
// ordinary live visits, so it fires in every mode (PRs #2 and #3 did; #5 and #6 only froze).
describe('PlaybackClock frame-ready signal', () => {
  it('fires after three frames, not before, on a frozen scene', async () => {
    const store = createPremiereStore({ freezeAt: 4 });
    const onFrameReady = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <PlaybackClock store={store} onFrameReady={onFrameReady} />,
    );

    await renderer.advanceFrames(2, 0.016);
    expect(onFrameReady).not.toHaveBeenCalled();

    await renderer.advanceFrames(1, 0.016);
    expect(onFrameReady).toHaveBeenCalledTimes(1);
    await renderer.unmount();
  });

  it('fires on a live visit too', async () => {
    const store = createPremiereStore();
    const onFrameReady = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <PlaybackClock store={store} onFrameReady={onFrameReady} />,
    );

    await renderer.advanceFrames(3, 0.016);

    expect(onFrameReady).toHaveBeenCalledTimes(1);
    await renderer.unmount();
  });

  it('fires exactly once however many frames follow', async () => {
    const store = createPremiereStore();
    const onFrameReady = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <PlaybackClock store={store} onFrameReady={onFrameReady} />,
    );

    await renderer.advanceFrames(40, 0.016);

    expect(onFrameReady).toHaveBeenCalledTimes(1);
    await renderer.unmount();
  });

  it('runs without any callbacks', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);

    await expect(renderer.advanceFrames(5, 0.016)).resolves.not.toThrow();
    await renderer.unmount();
  });
});
