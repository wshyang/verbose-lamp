// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CinemaAudioEngine } from './cinemaAudio';

type Param = {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
};
const param = (value = 0): Param => ({
  value,
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});
class MockNode {
  connect = vi.fn();
  disconnect = vi.fn();
}
class MockGain extends MockNode {
  gain = param(0.5);
}
class MockFilter extends MockNode {
  type = '';
  frequency = param();
  Q = param();
}
class MockOscillator extends MockNode {
  type = '';
  frequency = param();
  detune = param();
  start = vi.fn();
  stop = vi.fn();
}
let contexts: MockAudioContext[] = [];
let oscillatorFactory: (() => MockOscillator) | undefined;
class MockAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 10;
  destination = new MockNode();
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
  gains: MockGain[] = [];
  oscillators: MockOscillator[] = [];

  constructor() {
    contexts.push(this);
  }

  createGain() {
    const gain = new MockGain();
    this.gains.push(gain);
    return gain;
  }

  createBiquadFilter() {
    return new MockFilter();
  }

  createOscillator() {
    const oscillator = oscillatorFactory?.() ?? new MockOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
}
beforeEach(() => {
  contexts = [];
  oscillatorFactory = undefined;
  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.stubGlobal('webkitAudioContext', undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('CinemaAudioEngine', () => {
  it('starts a drone and arpeggio, retunes acts, then stops and restarts on the same context', () => {
    vi.useFakeTimers();
    const engine = new CinemaAudioEngine();
    expect(engine.toggle()).toBe(true);
    const context = contexts[0];
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.oscillators).toHaveLength(9);
    expect(context.oscillators[0].type).toBe('sine');
    expect(context.oscillators[1].type).toBe('sawtooth');
    expect(context.oscillators[4].type).toBe('triangle');

    engine.triggerActShimmer(7);
    expect(context.oscillators).toHaveLength(14);
    expect(engine.toggle()).toBe(false);
    vi.advanceTimersByTime(380);
    expect(context.oscillators[0].stop).toHaveBeenCalled();
    engine.triggerActShimmer(1);
    expect(context.oscillators).toHaveLength(14);

    context.state = 'running';
    expect(engine.toggle()).toBe(true);
    expect(contexts).toHaveLength(1);
    expect(context.resume).toHaveBeenCalledOnce();
  });

  it('uses webkitAudioContext when the standard constructor is absent', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);
    const engine = new CinemaAudioEngine();
    expect(engine.toggle()).toBe(true);
    expect(contexts).toHaveLength(1);
    engine.dispose();
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });

  it('handles stop and dispose before anything was started', () => {
    const engine = new CinemaAudioEngine();
    engine.stop();
    engine.dispose();
    expect(contexts).toHaveLength(0);
  });

  it('ignores oscillator stop errors and missing drone voices', () => {
    vi.useFakeTimers();
    const engine = new CinemaAudioEngine();
    engine.toggle();
    const internals = engine as unknown as { droneOscs: MockOscillator[] };
    internals.droneOscs[0].stop.mockImplementation(() => {
      throw new Error('already stopped');
    });
    engine.stop();
    vi.advanceTimersByTime(380);
    expect(internals.droneOscs).toEqual([]);

    engine.toggle();
    internals.droneOscs = [];
    expect(() => engine.triggerActShimmer(2)).not.toThrow();
  });

  it('stops an arpeggio if the context disappears mid-callback', () => {
    const engine = new CinemaAudioEngine();
    let created = 0;
    oscillatorFactory = () => {
      created += 1;
      const oscillator = new MockOscillator();
      if (created === 5) {
        oscillator.start.mockImplementation(() => {
          (engine as unknown as { ctx: unknown }).ctx = null;
        });
      }
      return oscillator;
    };
    expect(() => engine.toggle()).not.toThrow();
    expect(created).toBe(5);
  });
});
