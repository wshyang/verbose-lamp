// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { createPremiereStore } from './premiereStore';
import { clampSequenceTime } from '../scene/styleClamp';

/**
 * Every action the store exposes (ADDENDUM-022 §6 step 2.1). The transport, the scene
 * options and Frame Studio all end up here through `storeSceneApi`, so a regression in
 * this file is a regression in every control on the stage.
 */
describe('createPremiereStore defaults', () => {
  it('freezes at the requested second and stops playing', () => {
    const store = createPremiereStore({ freezeAt: 12.5 });

    expect(store.getState().currentTime).toBe(12.5);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().freezeAt).toBe(12.5);
  });

  it('clamps a frozen time into the film', () => {
    expect(createPremiereStore({ freezeAt: 999 }).getState().currentTime).toBe(clampSequenceTime(999));
  });
});
describe('playback actions', () => {
  it('clamps setTime and reports the toggle result', () => {
    const store = createPremiereStore();

    store.getState().setTime(-2);
    expect(store.getState().currentTime).toBe(0);

    store.getState().setTime(999);
    expect(store.getState().currentTime).toBeLessThan(TOTAL_SEQUENCE_DURATION);

    expect(store.getState().togglePlaying()).toBe(false);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().togglePlaying()).toBe(true);

    store.getState().setPlaying(false);
    expect(store.getState().isPlaying).toBe(false);
  });

  it('advances only while playing and not frozen', () => {
    const running = createPremiereStore();
    running.getState().advance(0.02);
    expect(running.getState().currentTime).toBeCloseTo(0.02, 9);
    expect(running.getState().elapsed).toBeCloseTo(0.02, 9);

    running.getState().setPlaying(false);
    running.getState().advance(0.02);
    expect(running.getState().currentTime).toBeCloseTo(0.02, 9);
    // The ambient clock keeps running while paused: the dust and searchlights move.
    expect(running.getState().elapsed).toBeCloseTo(0.04, 9);

    const frozen = createPremiereStore({ freezeAt: 5 });
    frozen.getState().advance(1);
    expect(frozen.getState().currentTime).toBe(5);
    expect(frozen.getState().elapsed).toBe(5);
  });
});
