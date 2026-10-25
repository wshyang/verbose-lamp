// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { PlaybackTelemetry } from '../scene/sceneApi';
import { createPremiereStore, type PremiereStore } from './premiereStore';
import { PremiereStoreContext } from './usePremiereStore';
import { PlaybackClock } from './PlaybackClock';

/**
 * Scene tests without a GPU (ADDENDUM-022 §7): advanceFrames drives the
 * priority −1 clock exactly as the render loop would, minus the pixels.
 */

async function renderClock(store: PremiereStore) {
  const callbacks = {
    onTelemetry: vi.fn<(telemetry: PlaybackTelemetry) => void>(),
    onChapterChange: vi.fn<(index: number) => void>(),
    onFrameReady: vi.fn<() => void>(),
  };
  const renderer = await ReactThreeTestRenderer.create(
    <PremiereStoreContext.Provider value={store}>
      <PlaybackClock {...callbacks} />
    </PremiereStoreContext.Provider>,
  );
  return { renderer, callbacks };
}

describe('PlaybackClock (scene, no GPU)', () => {
  it('never advances a frozen playhead, and readies after 3 frames', async () => {
    const store = createPremiereStore(5);
    const { renderer, callbacks } = await renderClock(store);
    await renderer.advanceFrames(10, 0.05);
    expect(store.getState().currentTime).toBe(5);
    expect(callbacks.onFrameReady).toHaveBeenCalledTimes(1);
    await renderer.unmount();
  });

  it('wraps the loop to 0 at 38 s', async () => {
    const store = createPremiereStore();
    store.getState().setTime(37.9);
    const { renderer } = await renderClock(store);
    await renderer.advanceFrames(1, 0.05);
    expect(store.getState().currentTime).toBeCloseTo(37.95, 6);
    await renderer.advanceFrames(2, 0.05);
    expect(store.getState().currentTime).toBe(0);
    await renderer.unmount();
  });

  it('fires onChapterChange once per handover, not per frame', async () => {
    const store = createPremiereStore();
    store.getState().setTime(7.0); // still the monogram chapter (0–7.2)
    const { renderer, callbacks } = await renderClock(store);
    await renderer.advanceFrames(3, 0.05);
    expect(callbacks.onChapterChange).toHaveBeenCalledTimes(1);
    expect(callbacks.onChapterChange).toHaveBeenLastCalledWith(0);
    store.getState().setTime(7.25); // dicaprio chapter (7.2–14.0)
    await renderer.advanceFrames(3, 0.05);
    expect(callbacks.onChapterChange).toHaveBeenCalledTimes(2);
    expect(callbacks.onChapterChange).toHaveBeenLastCalledWith(1);
    await renderer.unmount();
  });
});
