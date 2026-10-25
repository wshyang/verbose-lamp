// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CinemaAudioEngine } from './cinemaAudio';

interface FakeParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
}

interface FakeNode {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface FakeOscillator extends FakeNode {
  type: string;
  frequency: FakeParam;
  detune: FakeParam;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface FakeContext extends FakeNode {
  currentTime: number;
  state: 'running' | 'suspended';
  destination: FakeNode;
  gains: number;
  oscillators: FakeOscillator[];
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  createGain: () => FakeNode & { gain: FakeParam };
  createOscillator: () => FakeOscillator;
  createBiquadFilter: () => FakeNode & { type: string; frequency: FakeParam; Q: FakeParam };
}

function fakeParam(value = 0): FakeParam {
  return { value, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

function createFakeContext(state: 'running' | 'suspended' = 'running'): FakeContext {
  const context: FakeContext = {
    currentTime: 2,
    state,
    destination: { connect: vi.fn(), disconnect: vi.fn() },
    gains: 0,
    oscillators: [],
    connect: vi.fn(),
    disconnect: vi.fn(),
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain() {
      context.gains += 1;
      return { connect: vi.fn(), disconnect: vi.fn(), gain: fakeParam(0.5) };
    },
    createOscillator() {
      const osc: FakeOscillator = {
        type: 'sine',
        frequency: fakeParam(),
        detune: fakeParam(),
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      context.oscillators.push(osc);
      return osc;
    },
    createBiquadFilter() {
      return { connect: vi.fn(), disconnect: vi.fn(), type: 'lowpass', frequency: fakeParam(), Q: fakeParam() };
    },
  };
  return context;
}

function contextConstructor(context: FakeContext) {
  // `new` on a plain function returns the object the function yields.
  return function FakeAudioContext(this: unknown) {
    return context;
  } as unknown as typeof window.AudioContext;
}

function installAudioContext(context: FakeContext) {
  window.AudioContext = contextConstructor(context);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CinemaAudioEngine', () => {
  it('starts the drone and arpeggio on the first toggle and reports enabled', () => {
    const context = createFakeContext('suspended');
    installAudioContext(context);
    const engine = new CinemaAudioEngine();

    expect(engine.toggle()).toBe(true);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.gains).toBeGreaterThan(1);
    // one module gain + three drone gains; the arpeggio adds one gain per chord note.
    expect(context.oscillators.length).toBe(4 + 5);
    expect(context.oscillators[0].type).toBe('sine');
    expect(context.oscillators[1].type).toBe('sawtooth');
    expect(context.oscillators[0].start).toHaveBeenCalled();
  });

  it('falls back to webkitAudioContext and stops the drone on the second toggle', () => {
    vi.useFakeTimers();
    const context = createFakeContext();
    window.AudioContext = undefined as unknown as typeof window.AudioContext;
    (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = contextConstructor(context);
    const engine = new CinemaAudioEngine();

    expect(engine.toggle()).toBe(true);
    const drones = context.oscillators.slice(0, 4);
    expect(engine.toggle()).toBe(false);

    vi.runAllTimers();
    for (const drone of drones) {
      expect(drone.stop).toHaveBeenCalledTimes(1);
      expect(drone.disconnect).toHaveBeenCalledTimes(1);
    }
    delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
  });

  it('reuses the context across a stop and start cycle', () => {
    vi.useFakeTimers();
    const context = createFakeContext();
    installAudioContext(context);
    const engine = new CinemaAudioEngine();

    expect(engine.toggle()).toBe(true);
    expect(engine.toggle()).toBe(false);
    context.oscillators.length = 0;
    expect(engine.toggle()).toBe(true);
    expect(context.oscillators.length).toBe(4 + 5);
    vi.runAllTimers();
  });

  it('ignores shimmer requests while muted and wraps the act index when enabled', () => {
    const context = createFakeContext();
    installAudioContext(context);
    const engine = new CinemaAudioEngine();

    engine.triggerActShimmer(2);
    expect(context.oscillators).toHaveLength(0);

    engine.toggle();
    context.oscillators.length = 0;
    context.gains = 0;
    engine.triggerActShimmer(7);
    expect(context.oscillators).toHaveLength(5);
    expect(context.oscillators[0].frequency.setValueAtTime).toHaveBeenCalled();
  });

  it('tolerates an oscillator that already stopped when the drone closes', () => {
    vi.useFakeTimers();
    const context = createFakeContext();
    installAudioContext(context);
    const engine = new CinemaAudioEngine();
    engine.toggle();
    context.oscillators[0].stop.mockImplementation(() => {
      throw new Error('already stopped');
    });
    expect(() => {
      engine.toggle();
      vi.runAllTimers();
    }).not.toThrow();
  });

  it('disposes the context exactly once', () => {
    vi.useFakeTimers();
    const context = createFakeContext();
    installAudioContext(context);
    const engine = new CinemaAudioEngine();
    engine.toggle();

    engine.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
    vi.runAllTimers();

    engine.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('stops without a context or master gain', () => {
    const engine = new CinemaAudioEngine();
    expect(() => engine.dispose()).not.toThrow();
  });
});
