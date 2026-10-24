import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import { join } from 'node:path';
import { fileSink, Recorder } from './engine/recorder.js';
import { participantPlan, type ParticipantPlanOptions } from './engine/scripts.js';
import { SyntheticUser } from './engine/syntheticUser.js';
import { fetchTransport } from './engine/fetchTransport.js';
import { runShard } from './engine/shard.js';

/**
 * ADR-350 — one shard worker (the plan's §4): 75 of the 300 on its own thread, its own
 * event loop (so its own lag sampler — a stalled worker flags only its own receipts), and
 * its own four JSONL files (`frames.shard3.jsonl` beside its siblings).
 *
 * Two shapes, one file. FIXED mode is the Phase 2 `runShard` verbatim: admit everybody in
 * the window, act, leave at the horizon, post `done`. RAMP mode is a small protocol,
 * because the climb needs the orchestrator's hand on admission: `admit` starts users (they
 * live until their horizon or `finish`, whichever comes first), `stats` answers a drained
 * window for the step metrics, `finish` ends every live user and posts `done`.
 */

export interface FixedWorkerData {
  readonly mode: 'fixed';
  readonly shardIndex: number;
  readonly runId: string;
  readonly userIds: readonly number[];
  readonly baseUrl: string;
  readonly outDir: string;
  readonly planOptions: ParticipantPlanOptions;
  readonly windowMs: number;
  readonly teamCodes: readonly string[];
}

export interface RampWorkerData {
  readonly mode: 'ramp';
  readonly shardIndex: number;
  readonly runId: string;
  readonly baseUrl: string;
  readonly outDir: string;
  readonly planOptions: ParticipantPlanOptions;
  readonly teamCodes: readonly string[];
}

export type LoadWorkerData = FixedWorkerData | RampWorkerData;

export interface WorkerOutcome {
  readonly kind: 'done';
  readonly completed: number;
  readonly failed: number;
}

/** The cast mode ready gate's answer: who is in the room, whose status stream has spoken, and who never will. */
export interface WorkerStatus {
  readonly kind: 'status';
  readonly live: number;
  readonly snapshotted: number;
  /** Users that already failed (a 5xx signup) — the CLI fails the run instead of timing out. */
  readonly failed: number;
}

interface StatsRequest {
  readonly kind: 'stats';
}

interface StatusRequest {
  readonly kind: 'status';
}

type ParentMessage =
  | { kind: 'admit'; userIds: readonly number[] }
  | { kind: 'finish' }
  | StatsRequest
  | StatusRequest;

const data = workerData as LoadWorkerData;
const port = ensureParentPort();

function ensureParentPort(): MessagePort {
  if (parentPort === null) throw new Error('the load worker must run in a worker thread');
  return parentPort;
}

const shardTag = `shard${data.shardIndex}`;
const recorder = new Recorder({
  requests: fileSink(join(data.outDir, `requests.${shardTag}.jsonl`)),
  frames: fileSink(join(data.outDir, `frames.${shardTag}.jsonl`)),
  beats: fileSink(join(data.outDir, `beats.${shardTag}.jsonl`)),
  streams: fileSink(join(data.outDir, `streams.${shardTag}.jsonl`)),
});
const transport = fetchTransport(data.baseUrl);
const teamCode = (teamIndex: number): string | null => data.teamCodes[teamIndex] ?? null;

if (data.mode === 'fixed') {
  const outcome = await runShard({
    runId: data.runId,
    userIds: data.userIds,
    transport,
    recorder,
    teamCode,
    planOptions: data.planOptions,
    windowMs: data.windowMs,
  });
  post({ kind: 'done', completed: outcome.completed, failed: outcome.failed });
} else {
  await runRampProtocol(data);
}

function post(message: WorkerOutcome): void {
  port.postMessage(message);
}

async function runRampProtocol(ramp: RampWorkerData): Promise<void> {
  const live = new Map<number, SyntheticUser>();
  const snapshotted = new Set<number>();
  let completed = 0;
  let failed = 0;
  await new Promise<void>((resolve) => {
    port.on('message', (message: ParentMessage) => {
      if (message.kind === 'stats') {
        const window = recorder.stats();
        port.postMessage({ kind: 'window', window });
        return;
      }
      if (message.kind === 'status') {
        port.postMessage({ kind: 'status', live: live.size, snapshotted: snapshotted.size, failed });
        return;
      }
      if (message.kind === 'admit') {
        for (const userId of message.userIds) {
          const user = new SyntheticUser({
            userId,
            plan: participantPlan(ramp.runId, userId, ramp.planOptions),
            transport,
            recorder,
            teamCode,
            onStatusSnapshot: () => {
              snapshotted.add(userId);
            },
          });
          live.set(userId, user);
          void user.run().then(
            () => {
              live.delete(userId);
              completed += 1;
            },
            () => {
              live.delete(userId);
              failed += 1;
            },
          );
        }
        return;
      }
      // finish: end every live user, then post the outcome and let the worker exit.
      void (async (): Promise<void> => {
        await Promise.allSettled([...live.values()].map((user) => user.stop()));
        resolve();
      })();
    });
  });
  post({ kind: 'done', completed, failed });
  // The message listener keeps this thread ref'd; without closing, the CLI would never exit.
  port.close();
}
