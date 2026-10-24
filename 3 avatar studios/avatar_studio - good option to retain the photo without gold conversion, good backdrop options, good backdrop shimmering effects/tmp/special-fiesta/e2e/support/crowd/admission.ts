import { totalmem } from 'node:os';
import type { ResourceSample } from './resourceMonitor.js';

/**
 * ADR-348/349 — the admission controller: the crowd climbs and never retreats.
 *
 * `decide()` has two outcomes, `spawn` and `hold`. The prune branch does not exist — the owner
 * cut ADR-348's two-way controller in half before it was built, which deletes the thrash class
 * of bugs outright and makes assertion validity monotone with the crowd. What a one-way ratchet
 * sharpens is the cost of a wrong admission: a batch admitted on a transiently good sample is a
 * batch the run is stuck with. So growth is conservative in exactly the ways the plan demands:
 *
 *   - **sustained headroom** — `sustainedSamples` consecutive good samples, never one;
 *   - **probe-then-commit** — the first batch is small, and its measured marginal cost
 *     (available RAM before minus after) sizes every batch that follows;
 *   - **cooldown** between adjustments, and a **hard ceiling** from config — the kill switch
 *     that keeps a monitor bug from OOMing the machine.
 *
 * Three conditions stop the climb for the rest of the run (ADR-349's only brakes): swap
 * growth, sustained CPU above the ceiling, and a machine whose headroom stays below the growth
 * gate so long the climb has plainly topped out. A stopped controller is an honest one: a
 * `guarantee(k)` it cannot meet resolves `false`, and the caller skips the check *with a
 * reason* rather than letting a suite pass green by omission.
 */

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

export interface AdmissionConfig {
  /** Hard cap on concurrent alive extras — the kill switch (plan §11). */
  ceiling: number;
  /** The stack's and controller's own budget, subtracted before any headroom is counted. */
  reserveBytes: number;
  /** A sample is "good" only when available-minus-reserve exceeds this. */
  minHeadroomBytes: number;
  /** How many consecutive good samples must pile up before a batch is admitted. */
  sustainedSamples: number;
  /** The first, small batch whose measured cost sizes all later batches. */
  probeBatch: number;
  /** Samples after the probe lands without a visible RAM cost before assuming the worst. */
  probePatience: number;
  /** Cap on any post-probe batch. */
  batchMax: number;
  /** Minimum time between adjustments. */
  cooldownMs: number;
  /** load1/cores above this counts as a hot sample. */
  cpuCeiling: number;
  /** Swap growth past this stops the climb (macOS swaps lazily — growth is the real signal). */
  swapGrowthBytes: number;
  /** The fraction of current headroom one batch may spend. */
  safetyFraction: number;
  /** Clamps for the measured per-extra cost. */
  minMarginalBytes: number;
  maxMarginalBytes: number;
  /** Consecutive starved samples (headroom below the gate) before the climb is declared topped out. */
  topOutSamples: number;
}

/** Plan §11's defaults, sized from the machine's total memory. */
export function defaultAdmission(totalBytes: number = totalmem()): AdmissionConfig {
  return {
    ceiling: 120,
    reserveBytes: 5 * GiB,
    minHeadroomBytes: Math.floor(totalBytes * 0.25),
    sustainedSamples: 3,
    probeBatch: 5,
    probePatience: 10,
    batchMax: 10,
    cooldownMs: 15_000,
    cpuCeiling: 0.7,
    swapGrowthBytes: 128 * MiB,
    safetyFraction: 0.5,
    minMarginalBytes: 50 * MiB,
    maxMarginalBytes: 500 * MiB,
    topOutSamples: 15,
  };
}

export interface SpawnDecision {
  action: 'spawn';
  count: number;
  reason: 'probe batch — measure, then commit' | 'sized from the probe';
}

export interface HoldDecision {
  action: 'hold';
  reason: string;
}

export type Decision = SpawnDecision | HoldDecision;

/** Everything a beat or a report might need to know about the climb. */
export interface AdmissionState {
  /** The crowd's own truth — deaths and scripted departures reduce it; the controller never does. */
  alive: number;
  /** Monotone: every extra ever issued an id (dead ids are never reused, plan §5). */
  admitted: number;
  /** The first stop reason wins; later halts do not rewrite history. */
  stopped: string | null;
  /** The probe's measured per-extra cost, once known. */
  marginalBytes: number | null;
  consecutiveGood: number;
  lastAdjustAt: number | null;
}

export interface AdmissionOptions {
  config: AdmissionConfig;
  /** Admits `count` extras; a rejection stops the climb (the honest response to a failing stack). */
  spawn: (count: number) => Promise<void>;
  now?: () => number;
}

export class AdmissionController {
  private readonly config: AdmissionConfig;
  private readonly spawn: (count: number) => Promise<void>;
  private readonly now: () => number;
  private readonly waiters = new Set<() => void>();

  private latestSample?: ResourceSample;
  private baselineSwapBytes: number | null = null;
  private consecutiveGood = 0;
  private consecutiveHot = 0;
  private consecutiveStarved = 0;
  private stopped: string | null = null;
  private lastAdjustAt: number | null = null;
  private aliveCount = 0;
  private admittedCount = 0;
  private adjusting = false;
  private pendingAdjust: Promise<void> | null = null;

  private probeBaselineAvailableBytes: number | null = null;
  private probeAdmittedTarget: number | null = null;
  private probeCount = 0;
  private probeSamplesWithoutDrop = 0;
  private marginal: number | null = null;

  constructor(options: AdmissionOptions) {
    const { config } = options;
    if (config.ceiling < 1) throw new Error(`admission: ceiling must be at least 1 — got ${config.ceiling}`);
    if (config.sustainedSamples < 1) throw new Error('admission: sustainedSamples must be at least 1');
    if (config.probeBatch < 1) throw new Error('admission: probeBatch must be at least 1');
    if (config.minMarginalBytes > config.maxMarginalBytes) {
      throw new Error('admission: minMarginalBytes must not exceed maxMarginalBytes');
    }
    this.config = config;
    this.spawn = options.spawn;
    this.now = options.now ?? Date.now;
  }

  get state(): AdmissionState {
    return {
      alive: this.aliveCount,
      admitted: this.admittedCount,
      stopped: this.stopped,
      marginalBytes: this.marginal,
      consecutiveGood: this.consecutiveGood,
      lastAdjustAt: this.lastAdjustAt,
    };
  }

  /** Resolves when the adjustment triggered by the last sample (if any) has settled. */
  get busy(): Promise<void> {
    return this.pendingAdjust ?? Promise.resolve();
  }

  /** The crowd's truth: admissions, scripted departures, and deaths all report through here. */
  reportAlive(alive: number): void {
    this.aliveCount = alive;
    this.wake();
  }

  observe(sample: ResourceSample): void {
    this.latestSample = sample;
    if (this.baselineSwapBytes === null) this.baselineSwapBytes = sample.swapUsedBytes;
    if (sample.swapUsedBytes - this.baselineSwapBytes > this.config.swapGrowthBytes) {
      this.stop('swap growth — the machine is trading memory for time');
    }

    const hot = sample.load1 / sample.cores > this.config.cpuCeiling;
    this.consecutiveHot = hot ? this.consecutiveHot + 1 : 0;
    if (this.consecutiveHot >= this.config.sustainedSamples) {
      this.stop(`cpu above ${this.config.cpuCeiling} for ${this.consecutiveHot} samples — the stack needs the machine back`);
    }

    const roomy = sample.availableBytes - this.config.reserveBytes > this.config.minHeadroomBytes;
    this.consecutiveGood = roomy && !hot ? this.consecutiveGood + 1 : 0;
    this.consecutiveStarved = roomy ? 0 : this.consecutiveStarved + 1;
    if (this.consecutiveStarved >= this.config.topOutSamples) {
      this.stop('headroom below the growth gate for too long — the climb has topped out');
    }

    this.measureProbe(sample);
    void this.maybeAdjust();
  }

  /** Pure: reads the climb's state and says what the next adjustment is. Never prunes. */
  decide(): Decision {
    if (this.aliveCount >= this.config.ceiling) {
      return { action: 'hold', reason: 'the ceiling — the kill switch' };
    }
    if (this.stopped !== null) return { action: 'hold', reason: `stopped: ${this.stopped}` };
    if (this.marginal === null && this.probeAdmittedTarget !== null) {
      return { action: 'hold', reason: 'measuring the probe — commit comes after measure' };
    }
    if (this.lastAdjustAt !== null && this.now() - this.lastAdjustAt < this.config.cooldownMs) {
      return { action: 'hold', reason: 'cooldown between adjustments' };
    }
    if (this.consecutiveGood < this.config.sustainedSamples) {
      return {
        action: 'hold',
        reason: `sustained headroom ${this.consecutiveGood}/${this.config.sustainedSamples}`,
      };
    }
    const latest = this.latestSample;
    if (latest === undefined) return { action: 'hold', reason: 'no sample yet' };

    if (this.marginal === null) {
      return {
        action: 'spawn',
        count: Math.min(this.config.probeBatch, this.config.ceiling - this.aliveCount),
        reason: 'probe batch — measure, then commit',
      };
    }
    const headroom = latest.availableBytes - this.config.reserveBytes;
    const fit = Math.floor((headroom * this.config.safetyFraction) / this.marginal);
    if (fit < 1) {
      return { action: 'hold', reason: 'headroom cannot fit one more extra at the measured cost' };
    }
    return {
      action: 'spawn',
      count: Math.min(fit, this.config.batchMax, this.config.ceiling - this.aliveCount),
      reason: 'sized from the probe',
    };
  }

  /**
   * Blocks until k extras are alive, or resolves false the moment k is provably out of reach
   * (the ceiling forbids it, or the climb has stopped short). A false is a skip-with-reason for
   * the caller — never a silent pass (plan §6, the gate rule).
   */
  async guarantee(k: number): Promise<boolean> {
    if (k < 1) throw new Error(`guarantee needs k >= 1 — got ${k}`);
    for (;;) {
      if (this.aliveCount >= k) return true;
      if (this.config.ceiling < k) return false;
      if (this.stopped !== null) return false;
      /*
       * The waiter races a short sleep so a missed wake can never hang a guarantee. The waiter
       * is disposed after each race whether or not it fired, so the set never grows without
       * bound while a guarantee waits.
       */
      const waiter = this.waitForChange();
      await Promise.race([waiter.promise, sleep(250)]);
      waiter.dispose();
    }
  }

  /** ADR-349 — departures end the climb for good; this is how the run says so. */
  halt(reason: string): void {
    this.stop(reason);
  }

  private async maybeAdjust(): Promise<void> {
    if (this.adjusting) return;
    const decision = this.decide();
    if (decision.action !== 'spawn') return;
    const latest = this.latestSample;
    if (latest === undefined) return;
    this.adjusting = true;
    this.lastAdjustAt = this.now();
    const wasProbe = this.marginal === null;
    if (wasProbe) {
      this.probeBaselineAvailableBytes = latest.availableBytes;
      this.probeCount = decision.count;
      this.probeAdmittedTarget = this.admittedCount + decision.count;
    }
    this.admittedCount += decision.count;
    this.pendingAdjust = (async () => {
      try {
        await this.spawn(decision.count);
      } catch (error) {
        this.stop(`spawn failed: ${String(error)}`);
      } finally {
        this.adjusting = false;
        this.wake();
      }
    })();
    await this.pendingAdjust;
  }

  private measureProbe(sample: ResourceSample): void {
    if (this.marginal !== null || this.probeAdmittedTarget === null) return;
    if (this.probeBaselineAvailableBytes === null || this.aliveCount < this.probeAdmittedTarget) return;
    const drop = this.probeBaselineAvailableBytes - sample.availableBytes;
    if (drop > 0) {
      const measured = drop / Math.max(1, this.probeCount);
      this.marginal = Math.min(Math.max(measured, this.config.minMarginalBytes), this.config.maxMarginalBytes);
      this.probeSamplesWithoutDrop = 0;
    } else if ((this.probeSamplesWithoutDrop += 1) >= this.config.probePatience) {
      /*
       * The probe's cost never showed up in available RAM — either the machine is roomier than
       * one sample can see or the sampling raced it. Assume the worst and grow slowly.
       */
      this.marginal = this.config.maxMarginalBytes;
    }
  }

  private stop(reason: string): void {
    if (this.stopped !== null) return;
    this.stopped = reason;
    this.wake();
  }

  private waitForChange(): { promise: Promise<void>; dispose: () => void } {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((settle) => {
      resolve = settle;
    });
    this.waiters.add(resolve);
    return { promise, dispose: () => this.waiters.delete(resolve) };
  }

  private wake(): void {
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const waiter of waiters) waiter();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
