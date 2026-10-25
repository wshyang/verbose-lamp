import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BeatDelivery, Knee, RampStepRecord, RouteSummary } from './engine/summary.js';
import { summarizeDelivery, summarizeRequests } from './engine/summary.js';
import type { BeatRecord, FrameReceipt } from './engine/summary.js';
import type { RecordedRequest, StreamRecord } from './engine/recorder.js';
import type { LoadOptions } from './config.js';

/**
 * ADR-350 — the run's report (the plan's §8): every `*.jsonl` the run wrote, joined into
 * `summary.json` and printed. Kept on green runs too, because a clean run's numbers are
 * exactly the calibration data §9 will set thresholds from.
 *
 * The per-route block deliberately mirrors `npm run stress`'s report shape (ADR-025), so the
 * poll tier's numbers and this tier's can be set side by side and mean the same thing.
 */

export interface RampReport {
  readonly steps: readonly RampStepRecord[];
  readonly knee: Knee;
}

export interface LoadSummary {
  readonly runId: string;
  readonly generatedAt: string;
  readonly mode: 'fixed' | 'ramp' | 'cast';
  readonly options: {
    readonly users: number;
    readonly durationMs: number;
    readonly windowMs: number;
    readonly shards: number;
  };
  readonly delivery: readonly BeatDelivery[];
  readonly routes: Record<string, RouteSummary>;
  readonly streams: { readonly opened: number; readonly refused: number; readonly withoutSnapshot: number };
  readonly chatMessagesAcknowledged: number;
  readonly ramp: RampReport | null;
}

export interface ReportInput {
  readonly options: LoadOptions;
  readonly runId: string;
  readonly outDir: string;
  readonly ramp: RampReport | null;
  /**
   * Where the human-readable report goes. Standalone logs to stdout; cast mode owns stdout
   * for its one ready line, so it prints the report on stderr.
   */
  readonly log?: (line: string) => void;
}

export async function writeReport(input: ReportInput): Promise<LoadSummary> {
  const { options, runId, outDir, ramp } = input;
  const log = input.log ?? console.log;
  const beats = readJsonl<BeatRecord>(outDir, 'beats');
  const frames = readJsonl<FrameReceipt>(outDir, 'frames');
  const requests = readJsonl<RecordedRequest>(outDir, 'requests');
  const streams = readJsonl<StreamRecord>(outDir, 'streams');
  const chatAcknowledged = requests.filter((request) => request.route === 'POST /api/chat/messages' && request.status === 201).length;

  const summary: LoadSummary = {
    runId,
    generatedAt: new Date().toISOString(),
    mode: options.mode === 'cast' ? 'cast' : options.ramp ? 'ramp' : 'fixed',
    options: { users: options.users, durationMs: options.durationMs, windowMs: options.windowMs, shards: options.shards },
    delivery: summarizeDelivery(beats, frames),
    routes: Object.fromEntries(summarizeRequests(requests)),
    streams: {
      opened: streams.length,
      refused: streams.filter((stream) => stream.refusal !== undefined).length,
      withoutSnapshot: streams.filter((stream) => stream.snapshotMs === null).length,
    },
    chatMessagesAcknowledged: chatAcknowledged,
    ramp,
  };
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  printSummary(summary, log);
  return summary;
}

/** The read-back runs before the report: how many chat sends the server acknowledged. */
export function countAcknowledgedChat(outDir: string): number {
  return readJsonl<RecordedRequest>(outDir, 'requests').filter(
    (request) => request.route === 'POST /api/chat/messages' && request.status === 201,
  ).length;
}

/** Reads every `.{prefix}*.jsonl` in the run directory — the staff's and every shard's. */
function readJsonl<T>(outDir: string, prefix: string): T[] {
  const rows: T[] = [];
  for (const name of readdirSync(outDir)) {
    if (!name.startsWith(prefix) || !name.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(outDir, name), 'utf-8').split('\n')) {
      if (line.trim() !== '') rows.push(JSON.parse(line) as T);
    }
  }
  return rows;
}

function printSummary(summary: LoadSummary, log: (line: string) => void): void {
  log('[load] delivery by beat:');
  for (const beat of summary.delivery) {
    const latency =
      beat.latency === null
        ? 'no latency samples'
        : `p50 ${beat.latency.p50} ms, p90 ${beat.latency.p90} ms, p99 ${beat.latency.p99} ms, max ${beat.latency.max} ms`;
    log(
      `[load]   ${beat.beatId} (${beat.kind}): ${beat.delivered}/${beat.expected} delivered` +
        `, ${beat.duplicateReceipts} duplicate receipts, ${beat.laggedReceipts} lagged — ${latency}`,
    );
  }
  log('[load] routes:');
  for (const [route, row] of Object.entries(summary.routes)) {
    log(`[load]   ${route}: ${row.calls} calls, ${row.failed} failed, p50 ${row.p50} ms, p90 ${row.p90} ms, p99 ${row.p99} ms, max ${row.max} ms`);
  }
  log(
    `[load] streams: ${summary.streams.opened} opened, ${summary.streams.refused} refused, ${summary.streams.withoutSnapshot} without a snapshot`,
  );
  log(`[load] chat messages acknowledged: ${summary.chatMessagesAcknowledged}`);
  if (summary.ramp !== null) {
    log(`[load] ramp knee: ${summary.ramp.knee.kneeUsers ?? 'not reached'} (${summary.ramp.knee.cause ?? 'clean climb'})`);
  }
}

