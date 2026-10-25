// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it } from 'vitest';
import { PlaybackClock } from './PlaybackClock';
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
});
