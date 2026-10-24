import { describe, expect, it } from 'vitest';
import { AdmissionController, defaultAdmission, type AdmissionConfig } from './admission.js';
import type { ResourceSample } from './resourceMonitor.js';

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

/** A 32 GiB-class machine, as the plan's §4 bands assume. */
const TOTAL = 32 * GiB;

/**
 * A roomy reading by default: 20 GiB available, headroom 15 GiB against the default 5 GiB
 * reserve and 8 GiB gate — comfortably "good", so every test states only what it varies.
 */
function sample(over: Partial<ResourceSample> = {}): ResourceSample {
  return { t: 0, availableBytes: 20 * GiB, swapUsedBytes: 0, load1: 0.5, cores: 8, ...over };
}

/** The reading after the probe batch has eaten its RAM: 5 extras × 205 MiB. */
const AFTER_PROBE = sample({ availableBytes: 20 * GiB - 1025 * MiB });

function harness(over: Partial<AdmissionConfig> = {}) {
  let clock = 0;
  const spawns: number[] = [];
  let alive = 0;
  // The spawn closure reports back through `controller` — safe because it only runs once the
  // controller exists (spawn is called from observe, never from the constructor).
  const controller = new AdmissionController({
    config: { ...defaultAdmission(TOTAL), cooldownMs: 0, ...over },
    spawn: async (count) => {
      spawns.push(count);
      alive += count;
      controller.reportAlive(alive);
    },
    now: () => clock,
  });
  /** Observe one sample, advance the clock (1 s by default), let any adjustment settle. */
  const observe = async (s: ResourceSample, advanceMs = 1_000): Promise<void> => {
    clock += advanceMs;
    controller.observe(s);
    await controller.busy;
  };
  return { controller, spawns, observe, alive: () => alive };
}

describe('AdmissionController — the climb is monotone (ADR-349)', () => {
  it('spawns only after sustained headroom, and one bad sample resets the count', async () => {
    const { controller, spawns, observe } = harness({
      sustainedSamples: 3,
      probeBatch: 5,
      batchMax: 10,
      ceiling: 30,
    });

    // good, good, bad, good, good, bad, good, good — never three in a row, never a spawn.
    for (const good of [true, true, false, true, true, false, true, true]) {
      await observe(good ? sample() : sample({ availableBytes: 6 * GiB }));
    }
    expect(spawns).toEqual([]);

    await observe(sample()); // the third consecutive good — the probe fires.
    expect(spawns).toEqual([5]);
    expect(controller.state.alive).toBe(5);
    expect(controller.state.admitted).toBe(5);

    // The probe's cost shows up: 5 extras ate 1025 MiB → a measured 205 MiB each. The same
    // sample is the fourth consecutive good, and with no cooldown the climb continues at once.
    await observe(AFTER_PROBE);
    expect(controller.state.marginalBytes).toBe(205 * MiB);
    // Headroom ≈ 13 GiB, budget ≈ 6.5 GiB, at 205 MiB each ≈ 32 — clamped by batchMax 10.
    expect(spawns).toEqual([5, 10]);

    // A bad sample resets the sustained count: two good samples are not enough to climb again.
    await observe(sample({ availableBytes: 6 * GiB }));
    await observe(AFTER_PROBE);
    await observe(AFTER_PROBE);
    expect(spawns, 'the count needed three, only two arrived').toEqual([5, 10]);
    await observe(AFTER_PROBE);
    expect(spawns).toEqual([5, 10, 10]);
    expect(controller.state.admitted).toBe(25);
  });

  it('waits for the probe measurement before committing, and assumes the worst if it never comes', async () => {
    const { controller, spawns, observe } = harness({ sustainedSamples: 3, probePatience: 2 });
    for (let i = 0; i < 3; i += 1) await observe(sample());
    expect(spawns).toEqual([5]);

    // The RAM has not dropped: the climb waits — no second probe, no batch.
    await observe(sample());
    expect(spawns, 'commit comes after measure').toEqual([5]);
    expect(controller.state.marginalBytes).toBeNull();

    await observe(sample()); // patience spent — assume 500 MiB each and grow slowly.
    expect(controller.state.marginalBytes).toBe(500 * MiB);
    // 15 GiB headroom × 0.5 ÷ 500 MiB = 15 — clamped by batchMax 10.
    expect(spawns).toEqual([5, 10]);
  });

  it('swap growth stops the climb for good', async () => {
    const { controller, spawns, observe } = harness({ sustainedSamples: 3 });
    for (let i = 0; i < 3; i += 1) await observe(sample());
    expect(spawns).toEqual([5]);

    await observe(sample({ swapUsedBytes: 200 * MiB })); // baseline 0 → growth 200 MiB > 128 MiB
    expect(controller.state.stopped).toContain('swap');

    for (let i = 0; i < 5; i += 1) await observe(sample());
    expect(spawns, 'a stopped ratchet never spawns again').toEqual([5]);
    await expect(controller.guarantee(10)).resolves.toBe(false);
  });

  it('sustained CPU heat stops the climb; a single hot sample only resets the count', async () => {
    const { controller, spawns, observe } = harness({ sustainedSamples: 3 });
    const hot = sample({ load1: 7.2 }); // 0.9 of 8 cores > the 0.7 ceiling

    await observe(hot);
    await observe(sample());
    await observe(sample());
    expect(spawns, 'the hot sample reset the count').toEqual([]);
    expect(controller.state.stopped).toBeNull();

    await observe(sample());
    expect(spawns).toEqual([5]);

    for (let i = 0; i < 3; i += 1) await observe(hot);
    expect(controller.state.stopped).toContain('cpu');
    for (let i = 0; i < 3; i += 1) await observe(sample());
    expect(spawns).toEqual([5]);
  });

  it('the cooldown gates back-to-back adjustments', async () => {
    const { spawns, observe } = harness({ sustainedSamples: 3, cooldownMs: 60_000 });
    for (let i = 0; i < 3; i += 1) await observe(sample());
    expect(spawns).toEqual([5]); // the probe, at t = 3 s

    await observe(AFTER_PROBE, 61_000); // t = 64 s: measurement lands, cooldown elapsed → batch.
    expect(spawns).toEqual([5, 10]);

    await observe(sample()); // t = 65 s: sustained headroom, but one second inside cooldown.
    expect(spawns, 'a good sample inside the cooldown does not spawn').toEqual([5, 10]);
  });

  it('guarantee resolves true once the crowd reports k alive', async () => {
    const { controller, spawns, observe } = harness({ sustainedSamples: 3, ceiling: 30 });
    for (let i = 0; i < 3; i += 1) await observe(sample());
    expect(spawns).toEqual([5]);

    const guaranteed = controller.guarantee(10);
    await observe(AFTER_PROBE); // measures the probe and climbs past ten alive.
    await expect(guaranteed).resolves.toBe(true);
    expect(controller.state.alive).toBe(15);
  });

  it('a k the ceiling forbids is honestly false, immediately', async () => {
    const { controller } = harness({ ceiling: 30 });
    await expect(controller.guarantee(200)).resolves.toBe(false);
  });

  it('a starved machine tops out honestly instead of hanging a guarantee', async () => {
    const { controller, observe } = harness({ sustainedSamples: 3, topOutSamples: 3, cooldownMs: 60_000 });
    for (let i = 0; i < 3; i += 1) await observe(sample());
    await observe(AFTER_PROBE); // marginal measured; the cooldown holds the next batch back.

    const starved = sample({ availableBytes: 9 * GiB }); // headroom 4 GiB < the 8 GiB gate
    await observe(starved);
    await observe(starved);
    expect(controller.state.stopped, 'the streak has not reached its top yet').toBeNull();
    await observe(starved);
    expect(controller.state.stopped).toContain('topped out');
    await expect(controller.guarantee(20)).resolves.toBe(false);
  });

  it('halt: departures end the climb for good, and the first reason is the one kept', async () => {
    const { controller, spawns, observe } = harness({ sustainedSamples: 3 });
    for (let i = 0; i < 3; i += 1) await observe(sample());
    expect(spawns).toEqual([5]);

    controller.halt('scripted departures began — the climb never resumes (ADR-349)');
    expect(controller.state.stopped).toContain('departures');
    controller.halt('a later, different halt');
    expect(controller.state.stopped, 'the first stop reason is history, not a scratchpad').toContain('departures');

    for (let i = 0; i < 3; i += 1) await observe(sample());
    expect(spawns).toEqual([5]);
  });
});

