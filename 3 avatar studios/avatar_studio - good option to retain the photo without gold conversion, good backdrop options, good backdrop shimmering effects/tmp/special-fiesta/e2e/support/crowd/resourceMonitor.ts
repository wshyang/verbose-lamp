import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { cpus, loadavg } from 'node:os';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

/**
 * ADR-348 — the scale orchestrator's eyes.
 *
 * The admission controller can only be as honest as the numbers it sees, and on a Mac those
 * numbers have traps: `os.freemem()` under-reports (it ignores the purgeable file cache the
 * OS can hand back at any moment), so macOS is read through `vm_stat` — free + speculative +
 * purgeable pages — and Linux through `/proc/meminfo`'s `MemAvailable`, which already means
 * "the kernel can free this". Real pressure on a Mac shows as **swap growth**, not as a low
 * free number, so swap is sampled too (ADR-349: swap growth is one of the three things that
 * stop the climb for good).
 *
 * Every sample and every event lands in one JSONL telemetry file beside the run's artifacts —
 * plan §3 H2: a failure under load must be attributable *after the fact*, as a load flake or
 * a product bug, or the whole suite is a slot machine. Telemetry writing is best-effort on
 * purpose: a full disk must not kill the run, only make it quieter.
 */

const exec = promisify(execFile);

/** One reading of the machine the crowd must respect. */
export interface ResourceSample {
  /** epoch milliseconds */
  t: number;
  /** macOS: (free + speculative + purgeable) × page size. Linux: `MemAvailable`. */
  availableBytes: number;
  swapUsedBytes: number;
  /** the 1-minute load average — divide by `cores` for pressure. */
  load1: number;
  cores: number;
}

/** Parses macOS `vm_stat` output. Null when the text is not vm_stat's shape. */
export function parseVmStat(text: string): { pageSizeBytes: number; availableBytes: number } | null {
  const pageSize = text.match(/page size of (\d+) bytes/);
  const free = text.match(/^Pages free:\s+(\d+)\./m);
  if (pageSize === null || free === null) return null;
  const speculative = text.match(/^Pages speculative:\s+(\d+)\./m);
  const purgeable = text.match(/^Pages purgeable:\s+(\d+)\./m);
  const pages =
    Number(free[1]) +
    (speculative !== null ? Number(speculative[1]) : 0) +
    (purgeable !== null ? Number(purgeable[1]) : 0);
  return { pageSizeBytes: Number(pageSize[1]), availableBytes: pages * Number(pageSize[1]) };
}

/** Parses macOS `sysctl vm.swapusage` output into bytes of swap in use. Null when unrecognised. */
export function parseSwapUsage(text: string): number | null {
  const match = text.match(/used = ([\d.]+)([KMGT]?)/);
  if (match === null) return null;
  const unit = match[2] ?? '';
  const scale = unit === '' ? 1 : 1024 ** ('KMGT'.indexOf(unit) + 1);
  return Math.round(Number(match[1]) * scale);
}

/** Parses Linux `/proc/meminfo` text. Null without `MemAvailable` (pre-3.14 kernels). */
export function parseMemInfo(text: string): { availableBytes: number; swapUsedBytes: number } | null {
  const available = text.match(/^MemAvailable:\s+(\d+) kB$/m);
  if (available === null) return null;
  const swapTotal = text.match(/^SwapTotal:\s+(\d+) kB$/m);
  const swapFree = text.match(/^SwapFree:\s+(\d+) kB$/m);
  const swapUsedBytes =
    swapTotal !== null && swapFree !== null ? (Number(swapTotal[1]) - Number(swapFree[1])) * 1024 : 0;
  return { availableBytes: Number(available[1]) * 1024, swapUsedBytes };
}

/** Where raw numbers come from — injectable so the monitor loop is testable without a Mac. */
export interface SampleSources {
  read(): Promise<{ availableBytes: number; swapUsedBytes: number }>;
}

/** The platform's own sources: `vm_stat` + `sysctl` on macOS, `/proc/meminfo` on Linux. */
export function platformSources(): SampleSources {
  if (process.platform === 'darwin') {
    return {
      async read() {
        const [vmStat, swapUsage] = await Promise.all([exec('vm_stat'), exec('sysctl', ['vm.swapusage'])]);
        const parsed = parseVmStat(vmStat.stdout);
        if (parsed === null) {
          throw new Error('vm_stat output was not vm_stat\u2019s shape — cannot sample resources');
        }
        return { availableBytes: parsed.availableBytes, swapUsedBytes: parseSwapUsage(swapUsage.stdout) ?? 0 };
      },
    };
  }
  if (process.platform === 'linux') {
    return {
      async read() {
        const parsed = parseMemInfo(await readFile('/proc/meminfo', 'utf8'));
        if (parsed === null) {
          throw new Error('/proc/meminfo without MemAvailable — cannot sample resources');
        }
        return parsed;
      },
    };
  }
  return {
    async read() {
      throw new Error(
        `resource monitor: unsupported platform ${process.platform} — the crowd needs macOS (vm_stat) or Linux (/proc/meminfo)`,
      );
    },
  };
}

export interface MonitorOptions {
  sources?: SampleSources | undefined;
  /** Sample interval; the plan's default is 2 s. */
  intervalMs?: number | undefined;
  /** JSONL telemetry path — every sample and event, one JSON object per line. */
  telemetryPath?: string | undefined;
  now?: (() => number) | undefined;
}

/**
 * Samples the machine on an interval, keeps the latest reading, tells its listeners, and
 * appends everything to the telemetry file. The first sample is awaited by `start()` — a
 * machine that cannot be read even once is a preflight failure and fails loudly — while a
 * sample that fails later is recorded as a `sample-error` event and the run continues on the
 * last good reading, because a monitor hiccup must not end a twenty-minute climb.
 */
export class ResourceMonitor {
  private readonly sources: SampleSources;
  private readonly intervalMs: number;
  private readonly telemetryPath: string | undefined;
  private readonly now: () => number;
  private readonly cores: number;
  private readonly listeners = new Set<(sample: ResourceSample) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private latestSample?: ResourceSample;
  private everSampled = false;

  constructor(options: MonitorOptions = {}) {
    this.sources = options.sources ?? platformSources();
    this.intervalMs = options.intervalMs ?? 2_000;
    this.telemetryPath = options.telemetryPath;
    this.now = options.now ?? Date.now;
    this.cores = Math.max(1, cpus().length);
  }

  get latest(): ResourceSample | undefined {
    return this.latestSample;
  }

  /** Subscribes to samples; the returned function unsubscribes. */
  onSample(listener: (sample: ResourceSample) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Appends a run event (spawn, departure, death, …) to the telemetry file. */
  async logEvent(event: Record<string, unknown>): Promise<void> {
    await this.record({ kind: 'event', t: this.now(), ...event });
  }

  /** Takes the first sample immediately, then samples on the interval. */
  async start(): Promise<void> {
    if (this.timer !== null) return;
    await this.sampleNow();
    this.timer = setInterval(() => {
      if (this.inFlight !== null) return;
      this.inFlight = this.sampleNow().then(
        () => {
          this.inFlight = null;
        },
        () => {
          this.inFlight = null;
        },
      );
    }, this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight;
  }

  private async sampleNow(): Promise<void> {
    let raw: { availableBytes: number; swapUsedBytes: number };
    try {
      raw = await this.sources.read();
    } catch (error) {
      await this.record({ kind: 'sample-error', t: this.now(), message: String(error) });
      if (!this.everSampled) throw error;
      return;
    }
    const load = loadavg();
    this.latestSample = {
      t: this.now(),
      availableBytes: raw.availableBytes,
      swapUsedBytes: raw.swapUsedBytes,
      load1: load[0] ?? 0,
      cores: this.cores,
    };
    this.everSampled = true;
    await this.record({ kind: 'sample', ...this.latestSample });
    for (const listener of [...this.listeners]) listener(this.latestSample);
  }

  /** Best-effort by design — a telemetry write failure is logged to the console, not thrown. */
  private async record(line: Record<string, unknown>): Promise<void> {
    if (this.telemetryPath === undefined) return;
    try {
      await mkdir(dirname(this.telemetryPath), { recursive: true });
      await appendFile(this.telemetryPath, `${JSON.stringify(line)}\n`);
    } catch (error) {
      console.error('[scale] telemetry write failed — the run continues, the evidence thins:', error);
    }
  }
}
