// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { setupDomTests } from '@/test/dom';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { createPremiereStore } from './premiereStore';
import { PlaybackClock } from './PlaybackClock';

setupDomTests();

/**
 * The clock, mounted for real (ADDENDUM-022 §7). `advanceFrames` runs `useFrame`, so
 * this is the renderer's own loop rather than a fake timer.
 */
describe('PlaybackClock', () => {
  it('advances the store while playing', async () => {
    const store = createPremiereStore();
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);

    await renderer.advanceFrames(10, 0.016);

    expect(store.getState().currentTime).toBeGreaterThan(0);
    expect(store.getState().elapsed).toBeGreaterThan(0);
    await renderer.unmount();
  });

  it('never moves a frozen scene', async () => {
    const store = createPremiereStore({ freezeAt: 12.5 });
    const renderer = await ReactThreeTestRenderer.create(<PlaybackClock store={store} />);

    await renderer.advanceFrames(10, 0.016);

    expect(store.getState().currentTime).toBe(12.5);
    // The shader clock is pinned to the frozen moment, not left at zero.
    expect(store.getState().elapsed).toBe(12.5);
    await renderer.unmount();
  });

  it('marks the container ready after three frozen frames, not before', async () => {
    const store = createPremiereStore({ freezeAt: 4 });
    const container = document.createElement('div');
    const renderer = await ReactThreeTestRenderer.create(
      <PlaybackClock store={store} containerRef={{ current: container }} />
    );

    await renderer.advanceFrames(1, 0.016);
    await renderer.advanceFrames(1, 0.016);
    expect(container.dataset.frameReady).toBeUndefined();

    await renderer.advanceFrames(1, 0.016);
    expect(container.dataset.frameReady).toBe('true');
    await renderer.unmount();
  });

  it('reports a chapter handover once, not once per frame', async () => {
    const store = createPremiereStore();
    const onChapterChange = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <PlaybackClock store={store} onChapterChange={onChapterChange} />
    );

    await renderer.advanceFrames(4, 0.016); // still Act I
    expect(onChapterChange).toHaveBeenCalledTimes(1);
    expect(onChapterChange).toHaveBeenLastCalledWith(0);

    // Jump into Act III: the next frame must report the handover exactly once.
    store.getState().setTime(20);
    await renderer.advanceFrames(4, 0.016);
    expect(onChapterChange).toHaveBeenCalledTimes(2);
    expect(onChapterChange).toHaveBeenLastCalledWith(2);

    await renderer.unmount();
  });

  it('throttles telemetry to one report per interval, and always reports the first', async () => {
    const store = createPremiereStore();
    const onTelemetry = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <PlaybackClock store={store} onTelemetry={onTelemetry} telemetryIntervalMs={10_000} />
    );

    await renderer.advanceFrames(30, 0.016);

    expect(onTelemetry).toHaveBeenCalledTimes(1);
    expect(onTelemetry.mock.calls[0][0]).toMatchObject({ activeChapterIndex: 0, isPlaying: true });
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
