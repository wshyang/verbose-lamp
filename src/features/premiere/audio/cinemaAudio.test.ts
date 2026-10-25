// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CinemaAudioEngine } from './cinemaAudio';

interface FakeNode {
  connect: () => void;
  disconnect: () => void;
}

function param(value = 0) {
  return {
    value,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

/** Constructible stand-in: `new AudioCtx()` returns the spy object. */
function FakeAudioContext(this: unknown) {
  return built.ctx;
}

function makeAudioContext(state: AudioContextState = 'running') {
  const nodes: string[] = [];
  const ctx = {
    state,
    currentTime: 4,
    destination: { connect: () => undefined } as unknown as AudioDestinationNode,
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(() => {
      nodes.push('gain');
      return { gain: param(0.5), connect: vi.fn(), disconnect: vi.fn() };
    }),
    createBiquadFilter: vi.fn(() => {
      nodes.push('filter');
      return { type: 'lowpass', frequency: param(), Q: param(), connect: vi.fn() };
    }),
    createOscillator: vi.fn(() => {
      nodes.push('osc');
      return {
        type: 'sine',
        frequency: param(100),
        detune: param(),
        connect: (node: FakeNode) => void node,
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
    }),
  };
  return { ctx, nodes };
}

let built: ReturnType<typeof makeAudioContext>;

describe('CinemaAudioEngine', () => {
  beforeEach(() => {
    built = makeAudioContext();
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  it('starts a drone and reports itself enabled', () => {
    const engine = new CinemaAudioEngine();
    expect(engine.toggle()).toBe(true);
    expect(built.ctx.createOscillator).toHaveBeenCalledTimes(9);
    expect(built.ctx.createGain).toHaveBeenCalled();
    expect(built.ctx.resume).not.toHaveBeenCalled();
  });

  it('reuses the context when sound is switched back on', () => {
    built = makeAudioContext('running');
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const engine = new CinemaAudioEngine();
    engine.toggle();
    engine.toggle();
    const created = (globalThis as unknown as { AudioContext: unknown }).AudioContext;
    engine.toggle();
    // The second start must not build a second AudioContext: only the first one did.
    expect(created).toBe(FakeAudioContext);
    expect(built.ctx.createGain).toHaveBeenCalled();
    engine.dispose();
  });

  it('resumes a suspended context and stops on the second toggle', () => {
    vi.useFakeTimers();
    built = makeAudioContext('suspended');
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const engine = new CinemaAudioEngine();
    engine.toggle();
    expect(built.ctx.resume).toHaveBeenCalledOnce();
    expect(engine.toggle()).toBe(false);
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('ignores shimmer calls while disabled', () => {
    const engine = new CinemaAudioEngine();
    engine.triggerActShimmer(1);
    expect(built.ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('plays a chime per chord note for every act, wrapping the act index', () => {
    const engine = new CinemaAudioEngine();
    engine.toggle();
    built.ctx.createOscillator.mockClear();
    engine.triggerActShimmer(2);
    expect(built.ctx.createOscillator).toHaveBeenCalledTimes(5);
    engine.triggerActShimmer(7);
    expect(built.ctx.createOscillator).toHaveBeenCalledTimes(10);
  });

  it('survives a chord retune when a drone oscillator is missing', () => {
    const engine = new CinemaAudioEngine();
    engine.toggle();
    const original = built.ctx.createOscillator;
    built.ctx.createOscillator = original;
    // Removing the drone list exercises the defensive `if (this.droneOscs[0])` guards.
    (engine as unknown as { droneOscs: unknown[] }).droneOscs = [];
    expect(() => engine.triggerActShimmer(0)).not.toThrow();
  });

  it('skips the chime while the master gain is gone', () => {
    const engine = new CinemaAudioEngine();
    engine.toggle();
    built.ctx.createOscillator.mockClear();
    (engine as unknown as { masterGain: null }).masterGain = null;
    expect(() => engine.triggerActShimmer(1)).not.toThrow();
    expect(built.ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('closes the context on dispose', () => {
    const engine = new CinemaAudioEngine();
    engine.toggle();
    engine.dispose();
    expect(built.ctx.close).toHaveBeenCalledOnce();
  });

  it('disposes before ever starting without creating a context', () => {
    const engine = new CinemaAudioEngine();
    engine.stop();
    engine.dispose();
    expect(built.ctx.close).not.toHaveBeenCalled();
  });

  it('falls back to the webkit constructor when AudioContext is absent', () => {
    vi.stubGlobal('AudioContext', undefined);
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: FakeAudioContext });
    const engine = new CinemaAudioEngine();
    expect(engine.toggle()).toBe(true);
    expect(built.ctx.createOscillator).toHaveBeenCalled();
  });
});
