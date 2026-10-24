import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { BeatRecord, FrameReceipt, RequestRecord } from './summary.js';

/**
 * ADR-350 — the run's append-only record (the plan's §4, `recorder.ts`, and §8's files).
 *
 * Everything the tier claims is written here first and derived later by `summary.ts`, so a
 * number in a report is always a join over lines a test can read. The writers are JSONL for
 * a reason ADR-025 already learned: a crashed run keeps every line it managed to write, and
 * the partial record is exactly what a post-mortem needs.
 *
 * One recorder per worker, four sinks (§8's four event files — requests, frames, beats,
 * streams), so a shard writes `frames.shard3.jsonl` beside its siblings and no process shares
 * a file handle. A `MemorySink` in all four slots is Phase 2's in-process verification.
 *
 * `stats()` is the ramp's instrument (Phase 3): it DRAINS — counts and latencies are
 * reported for the window since the previous call — so the orchestrator can compute a
 * per-step error rate and p95 without touching the files.
 */

/** A receipt taken while the generator's own loop was stalled this long is flagged, not billed. */
export const LAG_THRESHOLD_MS = 50;

export interface JsonlSink {
  write(line: string): void;
}

/** The in-process sink: Phase 2's integration test asserts straight off it. */
export class MemorySink implements JsonlSink {
  readonly lines: string[] = [];
  write(line: string): void {
    this.lines.push(line);
  }
}

/** The run sink: one file per writer, appended line by line, created on first write. */
export function fileSink(path: string): JsonlSink {
  mkdirSync(dirname(path), { recursive: true });
  return {
    write(line: string): void {
      appendFileSync(path, `${line}\n`);
    },
  };
}

/**
 * The generator's own honesty check (plan §4): `perf_hooks.monitorEventLoopDelay`, sampled
 * between receipts. A stalled worker must not be allowed to bill its own stall to the
 * server — `Recorder.recordFrame` flags the receipt instead, and `summary.ts` counts it
 * delivered but excludes it from latency. The window resets on every read, so the flag
 * says "the loop was slow just before this frame arrived", which is the honest bound
 * available without instrumenting every await.
 */
export class LagSampler {
  private histogram: IntervalHistogram | null = null;

  start(): void {
    const monitor = monitorEventLoopDelay({ resolution: 5 });
    monitor.enable();
    monitor.reset();
    this.histogram = monitor;
  }

  /** Mean event-loop delay since the previous call, in ms; resets the window. */
  lagMs(): number {
    const monitor = this.histogram;
    if (monitor === null) return 0;
    const mean = monitor.mean;
    monitor.reset();
    return mean;
  }

  lagged(): boolean {
    return this.lagMs() > LAG_THRESHOLD_MS;
  }
}

/** The three streams a phone may hold (ADR-121: status always; the rooms by choice). */
export type StreamKind = 'status' | 'chat' | 'team';

/** Why a stream never delivered anything: the ADR-324 cap answers 429; the rest are transport. */
export type StreamRefusal = 'stream-cap' | 'fd' | 'network';

/** One held SSE stream's own facts (§8's `streams.jsonl`). */
export interface StreamRecord {
  readonly userId: number;
  readonly stream: StreamKind;
  /** `null` when the transport itself failed — no response existed to time. */
  readonly status: number | null;
  readonly connectMs: number;
  /** Request start to first frame; `null` means the stream never delivered its snapshot. */
  readonly snapshotMs: number | null;
  /** True when the body ended mid-event, or was refused before it began. */
  readonly truncated: boolean;
  readonly refusal?: StreamRefusal;
}

/** §8's `requests.jsonl` row: the route TEMPLATE plus who made it (ADR-025's rule, kept). */
export interface RecordedRequest extends RequestRecord {
  readonly userId: number;
}

/** The extras only some frames carry — announcement nonces, leaderboard cluster codes. */
export interface FrameExtras {
  readonly nonce?: string;
  readonly clusters?: readonly string[];
  /** `chat.activity` frames: the row's own `createdAt` (ADR-125), which the burst join matches. */
  readonly at?: string;
  /** `team.upsoon` frames: true entering the window, false leaving it (the join matches entering). */
  readonly upSoon?: boolean;
}

/** The drained window the ramp's step metrics are computed from. */
export interface RecorderWindow {
  readonly requests: number;
  readonly failedRequests: number;
  readonly frames: number;
  readonly laggedReceipts: number;
  /** 429s from the ADR-324 cap — the cap working, not a failure. */
  readonly streamCapRefusals: number;
  /** EMFILE/ENFILE — the generator's own process at the fd wall (plan §4). */
  readonly fdRefusals: number;
  readonly networkRefusals: number;
  readonly streamsOpened: number;
  /** Request latencies in the window, in ms — the p95 material. */
  readonly latencies: readonly number[];
}

export interface RecorderSinks {
  requests: JsonlSink;
  frames: JsonlSink;
  beats: JsonlSink;
  streams: JsonlSink;
}

/**
 * One recorder per worker. It owns the lag sampler so that every receipt in the process is
 * flagged against the same loop — and it is the only thing that stamps `tReceived`, which
 * keeps the clock single-sourced (plan §4: one clock, the generator's).
 */
export class Recorder {
  private readonly lag = new LagSampler();
  private window: WindowCounts = { requests: 0, failedRequests: 0, frames: 0, laggedReceipts: 0, streamCapRefusals: 0, fdRefusals: 0, networkRefusals: 0, streamsOpened: 0 };
  private latencies: number[] = [];

  constructor(
    private readonly sinks: RecorderSinks,
    private readonly now: () => number = Date.now,
  ) {
    this.lag.start();
  }

  recordRequest(userId: number, request: RequestRecord): void {
    this.append(this.sinks.requests, { userId, ...request } satisfies RecordedRequest);
    this.window.requests += 1;
    if (request.status >= 400) this.window.failedRequests += 1;
    this.latencies.push(request.ms);
  }

  /** Stamps receipt time and the lag flag — the two fields a user must never fake itself. */
  recordFrame(userId: number, event: string, extras: FrameExtras = {}): void {
    const lagged = this.lag.lagged();
    this.append(this.sinks.frames, {
      userId,
      event,
      ...(extras.nonce === undefined ? {} : { nonce: extras.nonce }),
      tReceived: this.now(),
      ...(lagged ? { lagged: true } : {}),
      ...(extras.clusters === undefined ? {} : { clusters: extras.clusters }),
      ...(extras.at === undefined ? {} : { at: extras.at }),
      ...(extras.upSoon === undefined ? {} : { upSoon: extras.upSoon }),
    } satisfies FrameReceipt);
    this.window.frames += 1;
    if (lagged) this.window.laggedReceipts += 1;
  }

  recordBeat(beat: BeatRecord): void {
    this.append(this.sinks.beats, beat);
  }

  recordStream(record: StreamRecord): void {
    this.append(this.sinks.streams, record);
    this.window.streamsOpened += 1;
    if (record.refusal === 'stream-cap') this.window.streamCapRefusals += 1;
    else if (record.refusal === 'fd') this.window.fdRefusals += 1;
    else if (record.refusal === 'network') this.window.networkRefusals += 1;
  }

  /** Drains the window: counts and latencies since the previous call (the ramp's steps). */
  stats(): RecorderWindow {
    const drained: RecorderWindow = { ...this.window, latencies: this.latencies };
    this.window = { requests: 0, failedRequests: 0, frames: 0, laggedReceipts: 0, streamCapRefusals: 0, fdRefusals: 0, networkRefusals: 0, streamsOpened: 0 };
    this.latencies = [];
    return drained;
  }

  private append<T>(sink: JsonlSink, row: T): void {
    sink.write(JSON.stringify(row));
  }
}

interface WindowCounts {
  requests: number;
  failedRequests: number;
  frames: number;
  laggedReceipts: number;
  streamCapRefusals: number;
  fdRefusals: number;
  networkRefusals: number;
  streamsOpened: number;
}
