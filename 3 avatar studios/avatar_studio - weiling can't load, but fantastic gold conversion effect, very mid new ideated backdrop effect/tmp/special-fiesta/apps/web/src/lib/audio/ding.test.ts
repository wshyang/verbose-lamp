import { afterEach, describe, expect, it, vi } from 'vitest';
import { playChatBlip, playDing, primeAudio, resetAudioForTests } from './ding.js';

/**
 * ADR-092 — the synthesised award chime. jsdom has no Web Audio API, which doubles as the
 * "ancient browser" case; a fake context proves the create-once/resume/reuse contract.
 */

class FakeOscillator {
  type = '';
  frequency = { setValueAtTime: vi.fn() };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  connect = vi.fn();
}

function fakeAudio() {
  const oscillators: FakeOscillator[] = [];
  const instances: FakeContext[] = [];
  class FakeContext {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    resume = vi.fn(() => {
      this.state = 'running';
      return Promise.resolve();
    });
    createOscillator = vi.fn(() => {
      const oscillator = new FakeOscillator();
      oscillators.push(oscillator);
      return oscillator;
    });
    createGain = vi.fn(() => new FakeGain());
    constructor() {
      instances.push(this);
    }
  }
  return { FakeContext, oscillators, instances };
}

afterEach(() => {
  resetAudioForTests();
  vi.unstubAllGlobals();
});

describe('ding', () => {
  it('does nothing at all where the Web Audio API is missing', () => {
    expect(() => {
      primeAudio();
      playDing();
    }).not.toThrow();
  });

  it('creates one context, resumes it inside the gesture, and reuses it afterwards', () => {
    const { FakeContext, instances } = fakeAudio();
    vi.stubGlobal('AudioContext', FakeContext);

    primeAudio();
    primeAudio();

    expect(instances).toHaveLength(1);
    expect(instances[0]?.resume).toHaveBeenCalledTimes(1);
  });

  it('plays a two-partial chime per ding and skips resume once running', () => {
    const { FakeContext, oscillators, instances } = fakeAudio();
    vi.stubGlobal('AudioContext', FakeContext);

    playDing();
    playDing();

    expect(instances).toHaveLength(1);
    expect(instances[0]?.resume).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(4);
    for (const oscillator of oscillators) {
      expect(oscillator.start).toHaveBeenCalledTimes(1);
      expect(oscillator.stop).toHaveBeenCalledTimes(1);
      expect(oscillator.frequency.setValueAtTime).toHaveBeenCalled();
    }
  });
});

describe('chat blip (ADR-103)', () => {
  it('does nothing at all where the Web Audio API is missing', () => {
    expect(() => playChatBlip()).not.toThrow();
  });

  it('plays one soft low partial per blip — quieter kin of the ding', () => {
    const { FakeContext, oscillators } = fakeAudio();
    vi.stubGlobal('AudioContext', FakeContext);

    playChatBlip();

    expect(oscillators).toHaveLength(1);
    expect(oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
    expect(oscillators[0]?.start).toHaveBeenCalled();
  });
});
