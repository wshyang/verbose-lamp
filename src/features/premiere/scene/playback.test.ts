import { describe, expect, it } from 'vitest';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { FRAME_READY_FRAMES, MAX_FRAME_DT, advanceClock, advanceElapsed, isFrameReady } from './playback';

const playing = { time: 10, isPlaying: true, isFrozen: false } as const;

// Expected values come from the shipped manager's frame step:
//   dt = Math.min(0.05, clock.getDelta()); if (isPlaying) { time += dt; if (time >= TOTAL) time = 0 }
//   elapsed = clock.elapsedTime            (raw wall time, never capped)
describe('advanceClock', () => {
  it('advances a playing clock by the frame delta', () => {
    expect(advanceClock(playing, 0.016)).toBeCloseTo(10.016, 12);
  });

  it('caps a long frame at 0.05 s so a hidden tab never skips an act', () => {
    expect(advanceClock(playing, 1.5)).toBeCloseTo(10 + MAX_FRAME_DT, 12);
    expect(MAX_FRAME_DT).toBe(0.05);
  });

  it('caps an infinite frame like the shipped clamp did', () => {
    expect(advanceClock(playing, Number.POSITIVE_INFINITY)).toBeCloseTo(10 + MAX_FRAME_DT, 12);
  });

  it('stands still while paused', () => {
    expect(advanceClock({ ...playing, isPlaying: false }, 0.016)).toBe(10);
  });

  it('stands still while frozen, whatever the transport says', () => {
    expect(advanceClock({ ...playing, isFrozen: true }, 0.016)).toBe(10);
    expect(advanceClock({ time: 4.32, isPlaying: true, isFrozen: true }, 5)).toBe(4.32);
  });

  // The shipped step let NaN through (`Math.min(0.05, NaN)` is NaN), so one bad delta
  // turned the playhead into NaN for good. A bad delta is a frame that did not happen.
  it('treats a NaN or negative delta as no time passing', () => {
    expect(advanceClock(playing, Number.NaN)).toBe(10);
    expect(advanceClock(playing, -0.5)).toBe(10);
    expect(advanceClock(playing, Number.NEGATIVE_INFINITY)).toBe(10);
  });

  // PR #6 carried the remainder over (`next - TOTAL`); the shipped manager restarted at
  // exactly 0, and the loop's first frame is part of the picture the likeness gate pins.
  it('wraps to the very start, as the shipped manager did', () => {
    const nearEnd = { time: TOTAL_SEQUENCE_DURATION - 0.02, isPlaying: true, isFrozen: false };

    expect(advanceClock(nearEnd, 0.05)).toBe(0);
  });

  it('wraps when the step lands exactly on the end', () => {
    const exact = { time: TOTAL_SEQUENCE_DURATION - 0.05, isPlaying: true, isFrozen: false };

    expect(advanceClock(exact, 0.05)).toBe(0);
  });

  it('does not wrap one frame short of the end', () => {
    const early = { time: TOTAL_SEQUENCE_DURATION - 0.2, isPlaying: true, isFrozen: false };

    expect(advanceClock(early, 0.05)).toBeCloseTo(TOTAL_SEQUENCE_DURATION - 0.15, 12);
  });

  it('plays a whole film in order without ever leaving the sequence', () => {
    let state = { time: 0, isPlaying: true, isFrozen: false };
    let previous = -1;
    let wrapped = false;
    for (let frame = 0; frame < 3000; frame += 1) {
      const time = advanceClock(state, 0.016);
      expect(time).toBeGreaterThanOrEqual(0);
      expect(time).toBeLessThan(TOTAL_SEQUENCE_DURATION);
      if (time < previous) wrapped = true;
      previous = time;
      state = { ...state, time };
    }

    expect(wrapped).toBe(true);
  });

  it('does not mutate the state it is given', () => {
    const state = { time: 10, isPlaying: true, isFrozen: false };

    advanceClock(state, 0.016);

    expect(state).toEqual({ time: 10, isPlaying: true, isFrozen: false });
  });
});

describe('advanceElapsed', () => {
  it('follows wall time while the film plays', () => {
    expect(advanceElapsed(2, 0.016, null)).toBeCloseTo(2.016, 12);
  });

  // The ambient shaders, the camera drift and the searchlight sway are functions of this
  // clock. The shipped manager read it uncapped, so a stall must not slow them down.
  it('does not cap a long frame, unlike the film clock', () => {
    expect(advanceElapsed(2, 1.5, null)).toBeCloseTo(3.5, 12);
  });

  it('holds a frozen frame at the moment it was frozen at, not at zero', () => {
    expect(advanceElapsed(0, 0.016, 12.5)).toBe(12.5);
    expect(advanceElapsed(99, 3, 0)).toBe(0);
  });

  it('treats a NaN or negative delta as no time passing', () => {
    expect(advanceElapsed(2, Number.NaN, null)).toBe(2);
    expect(advanceElapsed(2, -1, null)).toBe(2);
    expect(advanceElapsed(2, Number.POSITIVE_INFINITY, null)).toBe(2);
  });
});

describe('isFrameReady', () => {
  it('is false until three frames have been drawn, true on the third', () => {
    expect(FRAME_READY_FRAMES).toBe(3);
    expect(isFrameReady(0)).toBe(false);
    expect(isFrameReady(FRAME_READY_FRAMES - 1)).toBe(false);
    expect(isFrameReady(FRAME_READY_FRAMES)).toBe(true);
  });

  // The signal fires once, on the frame that crosses the line: a screenshot gate that sees
  // it again on every later frame cannot tell "just became ready" from "has been ready".
  it('fires on exactly one frame, not on every frame afterwards', () => {
    const ready = Array.from({ length: 10 }, (_, frame) => isFrameReady(frame)).filter(Boolean);

    expect(ready).toHaveLength(1);
  });
});
