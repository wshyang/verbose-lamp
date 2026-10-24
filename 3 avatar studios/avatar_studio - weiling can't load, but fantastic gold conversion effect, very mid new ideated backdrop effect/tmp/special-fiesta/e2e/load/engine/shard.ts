import { participantPlan, type ParticipantPlanOptions } from './scripts.js';
import type { Recorder } from './recorder.js';
import { SyntheticUser, type Transport } from './syntheticUser.js';

/**
 * ADR-350 — the sharding (plan §4): 300 users across 4 worker threads, 75 each. The split
 * is pure and unit-tested; `runShard` is the function a worker thread runs — it does not
 * know it is in a worker, which is the point: Phase 2's integration test runs a shard
 * in-process against `createApp()`, and Phase 3's worker entry wraps this same function
 * around a `fetch` transport with its own `Recorder` writing its own per-shard files.
 *
 * A user that throws is counted and left behind — one dead user must not take the shard's
 * other seventy-four with it. The failure is visible where it happened: no signup line in
 * `requests.jsonl`, no stream in `streams.jsonl`, no receipts in `frames.jsonl`.
 */

export interface ShardSplit {
  readonly shardIndex: number;
  readonly userIds: readonly number[];
}

/** Contiguous blocks, first shards bigger on the remainder — the same shape as fixedSchedule. */
export function shardUserIds(totalUsers: number, shardCount: number): readonly (readonly number[])[] {
  if (totalUsers < 0) throw new Error('totalUsers must not be negative');
  if (shardCount < 1) throw new Error('shardCount must be at least 1');
  const base = Math.floor(totalUsers / shardCount);
  const remainder = totalUsers % shardCount;
  const shards: number[][] = [];
  let next = 1;
  for (let shard = 0; shard < shardCount; shard += 1) {
    const size = base + (shard < remainder ? 1 : 0);
    shards.push(Array.from({ length: size }, (_, offset) => next + offset));
    next += size;
  }
  return shards;
}

export interface RunShardInput {
  readonly runId: string;
  readonly userIds: readonly number[];
  readonly transport: Transport;
  readonly recorder: Recorder;
  readonly teamCode?: (teamIndex: number) => string | null;
  readonly planOptions?: ParticipantPlanOptions;
  /** Admission spread inside the shard (plan §4's fixed window); 0 admits everyone at once. */
  readonly windowMs?: number;
  readonly now?: () => number;
}

export interface ShardOutcome {
  readonly completed: number;
  readonly failed: number;
}

export async function runShard(input: RunShardInput): Promise<ShardOutcome> {
  const total = input.userIds.length;
  const windowMs = input.windowMs ?? 0;
  const runs = input.userIds.map((userId, index) =>
    runOne(input, userId, total === 0 ? 0 : Math.floor((windowMs * index) / total)),
  );
  const outcomes = await Promise.all(runs);
  return {
    completed: outcomes.filter((ok) => ok).length,
    failed: outcomes.filter((ok) => !ok).length,
  };
}

async function runOne(input: RunShardInput, userId: number, offsetMs: number): Promise<boolean> {
  await new Promise((resolve) => {
    setTimeout(resolve, offsetMs);
  });
  const user = new SyntheticUser({
    userId,
    plan: participantPlan(input.runId, userId, input.planOptions),
    transport: input.transport,
    recorder: input.recorder,
    teamCode: input.teamCode ?? (() => null),
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  try {
    await user.run();
    return true;
  } catch {
    return false;
  }
}
