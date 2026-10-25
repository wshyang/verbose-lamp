import { describe, expect, it } from 'vitest';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { MAX_FRAME_DT, advanceClock, advanceElapsed } from './playback';

/** The clock the R3F port drives from `useFrame` (ADDENDUM-022 §7). */
describe('advanceClock', () => {
  const running = { time: 4, isPlaying: true };

  it('advances a playing clock by the frame delta', () => {
    expect(advanceClock(running, 0.016, false)).toBeCloseTo(4.016, 9);
  });

  it('caps a long frame, so a hidden tab does not skip an act', () => {
    expect(advanceClock(running, 2.5, false)).toBeCloseTo(4 + MAX_FRAME_DT, 9);
    expect(advanceClock(running, Number.NaN, false)).toBe(4);
    expect(advanceClock(running, -1, false)).toBe(4);
  });

  it('does not move while paused or frozen', () => {
    expect(advanceClock({ time: 4, isPlaying: false }, 0.016, false)).toBe(4);
    expect(advanceClock(running, 0.016, true)).toBe(4);
    expect(advanceClock({ time: 12, isPlaying: false }, 0.016, true)).toBe(12);
  });

  it('wraps to the top rather than holding on the last frame', () => {
    expect(advanceClock({ time: TOTAL_SEQUENCE_DURATION - 0.01, isPlaying: true }, 0.05, false)).toBeCloseTo(
      0.04,
      9
    );
  });
});

describe('advanceElapsed', () => {
  it('runs the ambient shader clock forward while the film plays', () => {
    expect(advanceElapsed(10, 0.02, null)).toBeCloseTo(10.02, 9);
    expect(advanceElapsed(10, 5, null)).toBeCloseTo(10 + MAX_FRAME_DT, 9);
    expect(advanceElapsed(10, Number.NaN, null)).toBe(10);
  });

  it('holds a frozen frame at the moment it was frozen at, not at zero', () => {
    expect(advanceElapsed(0, 0.02, 24.82)).toBe(24.82);
    expect(advanceElapsed(31, 0.02, 1)).toBe(1);
  });
});
