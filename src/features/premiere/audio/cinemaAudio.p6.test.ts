// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CinemaAudioEngine } from './cinemaAudio';

import { setupDomTests } from '@/test/dom';

setupDomTests();
/**
 * A stand-in Web Audio graph. jsdom ships no `AudioContext`, and the score is
 * entirely procedural, so a recording graph is the honest way to pin it down:
 * chord counts, ramps and shutdown (ADDENDUM-029 §4).
 */
interface Node {
  kind: string;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}
function audioGraph(state: { suspended?: boolean } = {}) {
  const nodes: Node[] = [];
  const oscillators: Array<
    Node & {
      type: string;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      frequency: Record<string, unknown> & { setValueAtTime: ReturnType<typeof vi.fn> };
    }
  > = [];
  const ramps: Array<[string, number, number]> = [];

  const param = (label: string, value = 0) => {
    const p = {
      value,
      setValueAtTime: vi.fn((v: number, t: number) => {
        ramps.push([`${label}.set`, v, t]);
        p.value = v;
      }),
      exponentialRampToValueAtTime: vi.fn((v: number, t: number) => {
        ramps.push([`${label}.ramp`, v, t]);
        p.value = v;
      }),
      linearRampToValueAtTime: vi.fn(),
    };
    return p;
  };

  const makeNode = (kind: string): Node => {
    const node = { kind, connect: vi.fn(), disconnect: vi.fn() } as Node;
    nodes.push(node);
    return node;
  };

  const ctx = {
    state: state.suspended ? 'suspended' : 'running',
    currentTime: 10,
    destination: { kind: 'destination' },
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(() => ({ ...makeNode('gain'), gain: param('gain') })),
    createBiquadFilter: vi.fn(() => ({
      ...makeNode('filter'),
      type: '',
      frequency: param('filter.frequency', 0),
      Q: param('filter.Q', 0),
    })),
    createOscillator: vi.fn(() => {
      const osc = {
        ...makeNode('osc'),
        type: '',
        frequency: param('osc.frequency'),
        detune: param('osc.detune'),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc as never);
      return osc;
    }),
  };

  vi.stubGlobal('AudioContext', function AudioContextStub() {
    return ctx;
  });
  Object.defineProperty(window, 'AudioContext', { value: ctx.constructor, configurable: true, writable: true });
  (window as unknown as { AudioContext: unknown }).AudioContext = function AudioContextStub() {
    return ctx;
  };

  return { ctx, nodes, oscillators, ramps };
}
let engine: CinemaAudioEngine | null = null;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  engine?.dispose();
  engine = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('CinemaAudioEngine', () => {
  it('starts silent and builds the drone on the first toggle', () => {
    const graph = audioGraph();
    engine = new CinemaAudioEngine();

    expect(engine.toggle()).toBe(true);

    expect(graph.ctx.createGain).toHaveBeenCalled();
    expect(graph.ctx.createBiquadFilter).toHaveBeenCalledTimes(1);
    // Four detuned drone oscillators, the lowest a sine.
    expect(graph.oscillators.length).toBeGreaterThanOrEqual(4);
    expect(graph.oscillators.slice(0, 4).map((osc) => osc.type)).toEqual([
      'sine',
      'sawtooth',
      'sawtooth',
      'sawtooth',
    ]);
    expect(graph.oscillators.filter((osc) => osc.start.mock.calls.length > 0).length).toBeGreaterThan(0);
  });

  it('ramps the master gain up from near silence', () => {
    const graph = audioGraph();
    engine = new CinemaAudioEngine();
    engine.toggle();

    const master = graph.ramps.filter(([label]) => label.startsWith('gain.'));
    expect(master[0][1]).toBeCloseTo(0.0001, 6);
    expect(master.some(([, value]) => value === 0.18)).toBe(true);
  });

  it('resumes a suspended context', () => {
    const graph = audioGraph({ suspended: true });
    engine = new CinemaAudioEngine();
    engine.toggle();
    expect(graph.ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('reuses the same context across toggles', () => {
    const graph = audioGraph();
    engine = new CinemaAudioEngine();
    engine.toggle();

    engine.toggle();
    engine.toggle();

    // The drone filter is built once per start, and the context is not replaced.
    expect(graph.ctx.createBiquadFilter).toHaveBeenCalledTimes(2);
    expect(graph.ctx.close).not.toHaveBeenCalled();
  });

  it('silences the master and stops the drones when toggled off', () => {
    const graph = audioGraph();
    engine = new CinemaAudioEngine();
    engine.toggle();
    const drones = graph.oscillators.slice(0, 4);

    expect(engine.toggle()).toBe(false);
    vi.advanceTimersByTime(380);

    expect(drones.every((drone) => drone.stop.mock.calls.length === 1)).toBe(true);
    expect(drones.every((drone) => drone.disconnect.mock.calls.length === 1)).toBe(true);
    expect(graph.ramps.at(-1)?.[1]).toBeCloseTo(0.0001, 6);
  });

  it('survives a drone that was already stopped', () => {
    const graph = audioGraph();
    engine = new CinemaAudioEngine();
    engine.toggle();
    graph.oscillators[0].stop.mockImplementation(() => {
      throw new Error('already stopped');
    });

    expect(() => engine?.toggle()).not.toThrow();
    expect(() => vi.advanceTimersByTime(380)).not.toThrow();
  });

  it('retunes the two lowest drones into the act chord and plays an arpeggio', () => {
    const graph = audioGraph();
    engine = new CinemaAudioEngine();
    engine.toggle();
    const before = graph.oscillators.length;

    engine.triggerActShimmer(2);

    const chordOscs = graph.oscillators.slice(before);
    // Act III is Fmaj7#11: five notes, each doubled an octave up, staggered 110 ms.
    expect(chordOscs).toHaveLength(5);
    expect(chordOscs.every((osc) => osc.type === 'triangle')).toBe(true);
    const starts = chordOscs.map((osc) => osc.start.mock.calls[0][0] as number);
    expect(starts[1] - starts[0]).toBeCloseTo(0.11, 6);
    expect(chordOscs[0].frequency.setValueAtTime).toHaveBeenCalledWith(174.61 * 2, starts[0]);
    expect(chordOscs.every((osc) => osc.stop.mock.calls.length === 1)).toBe(true);
  });

  it('wraps the act index around the score', () => {
    const graph = audioGraph();
    engine = new CinemaAudioEngine();
    engine.toggle();

    const before = graph.oscillators.length;
    engine.triggerActShimmer(5);
    engine.triggerActShimmer(0);

    const actOne = graph.oscillators.slice(before + 5)[0];
    expect(actOne.frequency.setValueAtTime).toHaveBeenCalledWith(130.81 * 2, expect.any(Number));
  });

  it('ignores shimmers before the score starts', () => {
    const graph = audioGraph();
    engine = new CinemaAudioEngine();

    engine.triggerActShimmer(1);

    expect(graph.oscillators).toHaveLength(0);
  });

  it('ignores shimmers while muted', () => {
    const graph = audioGraph();
    engine = new CinemaAudioEngine();
    engine.toggle();
    engine.toggle();
    const before = graph.oscillators.length;

    engine.triggerActShimmer(3);

    expect(graph.oscillators).toHaveLength(before);
  });

  it('closes the context on dispose and stays quiet afterwards', () => {
    const graph = audioGraph();
    engine = new CinemaAudioEngine();
    engine.toggle();

    engine.dispose();
    vi.advanceTimersByTime(400);

    expect(graph.ctx.close).toHaveBeenCalledTimes(1);
    const quiet = graph.oscillators.length;
    engine.triggerActShimmer(0);
    expect(graph.oscillators).toHaveLength(quiet);
    engine = null;
  });

  it('disposes safely before anything started', () => {
    engine = new CinemaAudioEngine();
    expect(() => engine?.dispose()).not.toThrow();
  });

  it('supports the webkit-prefixed context', () => {
    const graph = audioGraph();
    const audioContext = (window as unknown as { AudioContext: unknown }).AudioContext;
    (window as unknown as { AudioContext: unknown }).AudioContext = undefined;
    (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = audioContext;
    engine = new CinemaAudioEngine();

    expect(engine.toggle()).toBe(true);
    expect(graph.ctx.createGain).toHaveBeenCalled();

    (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = undefined;
    (window as unknown as { AudioContext: unknown }).AudioContext = audioContext;
  });
});
