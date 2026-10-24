import { describe, expect, it } from 'vitest';
import {
  detectKnee,
  percentile,
  summarizeDelivery,
  summarizeRequests,
  type BeatRecord,
  type FrameReceipt,
  type RampStepRecord,
  type RequestRecord,
} from './summary.js';

describe('percentile — the method the stress harness itself uses, mirrored', () => {
  it('is nearest-rank: ceil(f×n)−1, clamped — the same numbers metrics.mjs prints', () => {
    const oneToHundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(oneToHundred, 0.5)).toBe(50);
    expect(percentile(oneToHundred, 0.9)).toBe(90);
    expect(percentile(oneToHundred, 0.99)).toBe(99);
    expect(percentile(oneToHundred, 1)).toBe(100);
    expect(percentile([7], 0.95)).toBe(7);
    expect(percentile([], 0.95)).toBe(0);
  });
});

describe('summarizeDelivery — the honesty rules', () => {
  const beat: BeatRecord = { beatId: 'b1', kind: 'announcement', nonce: '[r1:b1]', t0: 1_000, expectedUsers: 4 };

  it('counts a missed user as silence (ratio < 1) and a duplicate telling only once', () => {
    const frames: FrameReceipt[] = [
      { userId: 1, event: 'announcement', nonce: '[r1:b1]', tReceived: 1_120 },
      { userId: 1, event: 'announcement', nonce: '[r1:b1]', tReceived: 1_400 }, // told twice
      { userId: 2, event: 'announcement', nonce: '[r1:b1]', tReceived: 1_180 },
      { userId: 3, event: 'announcement', nonce: '[r1:b1]', tReceived: 1_260 },
      // user 4: nothing — the miss this tier exists to catch
      { userId: 9, event: 'leaderboard', nonce: '[r1:b9]', tReceived: 2_000 }, // another beat's nonce
    ];
    const [summary] = summarizeDelivery([beat], frames);
    expect(summary?.delivered).toBe(3);
    expect(summary?.expected).toBe(4);
    expect(summary?.ratio).toBe(0.75);
    expect(summary?.duplicateReceipts).toBe(1);
    expect(summary?.latency).toEqual({ p50: 180, p90: 260, p99: 260, max: 260 });
  });

  it('delivers a lagged receipt but never bills its latency to the server', () => {
    const frames: FrameReceipt[] = [
      { userId: 1, event: 'announcement', nonce: '[r1:b1]', tReceived: 1_100 },
      { userId: 2, event: 'announcement', nonce: '[r1:b1]', tReceived: 9_500, lagged: true }, // generator stalled
      { userId: 3, event: 'announcement', nonce: '[r1:b1]', tReceived: 1_300 },
      { userId: 4, event: 'announcement', nonce: '[r1:b1]', tReceived: 1_150 },
    ];
    const [summary] = summarizeDelivery([beat], frames);
    expect(summary?.delivered).toBe(4);
    expect(summary?.ratio).toBe(1);
    expect(summary?.laggedReceipts).toBe(1);
    // Latency percentiles drawn from the three honest receipts only: [100, 150, 300].
    expect(summary?.latency).toEqual({ p50: 150, p90: 300, p99: 300, max: 300 });
  });

  it('takes a user told twice at their FIRST telling, and survives an empty beat list', () => {
    const frames: FrameReceipt[] = [
      { userId: 1, event: 'announcement', nonce: '[r1:b1]', tReceived: 5_000 },
      { userId: 1, event: 'announcement', nonce: '[r1:b1]', tReceived: 1_200 },
    ];
    const [summary] = summarizeDelivery([beat], frames);
    expect(summary?.latency?.p50).toBe(200);
    expect(summarizeDelivery([], frames)).toEqual([]);
  });
});

describe('summarizeDelivery — the frozen leaderboard join', () => {
  it('joins a leaderboard beat by first frame after t0 touching the scanned cluster', () => {
    const beat: BeatRecord = { beatId: 's1_1', kind: 'leaderboard', nonce: '', t0: 1_000, expectedUsers: 3, clusterCode: 'BP' };
    const frames: FrameReceipt[] = [
      // user 1: a leaderboard frame BEFORE t0 touching BP — the previous scan, not this beat.
      { userId: 1, event: 'leaderboard', tReceived: 900, clusters: ['BP', 'CentEx'] },
      // user 1's first BP-touching frame after t0, at 1_150.
      { userId: 1, event: 'leaderboard', tReceived: 1_150, clusters: ['BP'] },
      // user 2: sees the board move for a DIFFERENT cluster first, then BP — the BP one is theirs.
      { userId: 2, event: 'leaderboard', tReceived: 1_100, clusters: ['CHROO'] },
      { userId: 2, event: 'leaderboard', tReceived: 1_300, clusters: ['BP', 'CHROO'] },
      // user 3: the board moved but never touched the scanned cluster — silence, counted as a miss.
      { userId: 3, event: 'leaderboard', tReceived: 1_200, clusters: ['CentEx'] },
      // noise: another event entirely, and a lagged BP receipt that still counts as delivered.
      { userId: 3, event: 'chat.activity', tReceived: 1_250 },
      { userId: 1, event: 'leaderboard', tReceived: 5_000, clusters: ['BP'], lagged: true },
    ];
    const [summary] = summarizeDelivery([beat], frames);
    expect(summary?.delivered).toBe(2);
    expect(summary?.expected).toBe(3);
    expect(summary?.ratio).toBeCloseTo(2 / 3);
    // user 1's FIRST BP frame after t0 is the 1_150 one; user 2's is the 1_300 one.
    expect(summary?.latency).toEqual({ p50: 150, p90: 300, p99: 300, max: 300 });
  });

  it('keeps the nonce join for announcement beats untouched beside it', () => {
    const beats: readonly BeatRecord[] = [
      { beatId: 'a1', kind: 'announcement', nonce: 'r1:b1', t0: 1_000, expectedUsers: 1 },
      { beatId: 's1_1', kind: 'leaderboard', nonce: '', t0: 1_000, expectedUsers: 1, clusterCode: 'BP' },
    ];
    const frames: readonly FrameReceipt[] = [
      { userId: 1, event: 'announcement', nonce: 'r1:b1', tReceived: 1_050 },
      { userId: 1, event: 'leaderboard', tReceived: 1_100, clusters: ['BP'] },
    ];
    const summaries = summarizeDelivery(beats, frames);
    expect(summaries[0]?.delivered).toBe(1);
    expect(summaries[1]?.delivered).toBe(1);
  });
});

describe('summarizeDelivery — the cast-mode joins (Phase 4)', () => {
  it('joins a match result by first leaderboard frame at or after t0, unrestricted', () => {
    const beat: BeatRecord = { beatId: 'm1:board', kind: 'match-result', t0: 2_000, expectedUsers: 3 };
    const frames: FrameReceipt[] = [
      // The day's start pushed a board frame BEFORE t0 — ambient, not this beat's.
      { userId: 1, event: 'leaderboard', tReceived: 1_500, clusters: ['BP'] },
      // The completion's frame: every stream, whatever clusters it touches.
      { userId: 1, event: 'leaderboard', tReceived: 2_050, clusters: ['CentEx'] },
      { userId: 2, event: 'leaderboard', tReceived: 2_120, clusters: ['BP'] },
      { userId: 2, event: 'leaderboard', tReceived: 2_300, clusters: ['BP'] }, // told twice
      // user 3: nothing after t0 — the miss.
    ];
    const [summary] = summarizeDelivery([beat], frames);
    expect(summary?.delivered).toBe(2);
    expect(summary?.expected).toBe(3);
    expect(summary?.duplicateReceipts).toBe(1);
    expect(summary?.latency?.p50).toBe(50);
  });

  it('joins up-soon by first TRUE team.upsoon frame at or after t0 — the entering teams\' claim', () => {
    const beat: BeatRecord = { beatId: 'm1:upsoon', kind: 'up-soon', t0: 2_000, expectedUsers: 2 };
    const frames: FrameReceipt[] = [
      // Entering teams' members: their first frame after t0 (the watcher publishes ≤5 s later).
      { userId: 1, event: 'team.upsoon', upSoon: true, tReceived: 2_400 },
      { userId: 2, event: 'team.upsoon', upSoon: true, tReceived: 6_900 },
      // A leaving team's clearing frame — a real receipt, but not the entering sentence.
      { userId: 3, event: 'team.upsoon', upSoon: false, tReceived: 2_500 },
      // The day-start transition, before t0 — ambient.
      { userId: 1, event: 'team.upsoon', upSoon: true, tReceived: 1_400 },
    ];
    const [summary] = summarizeDelivery([beat], frames);
    expect(summary?.delivered).toBe(2);
    expect(summary?.ratio).toBe(1);
    // user 1's first post-t0 entering frame is the 2_400 one, not the 1_400 ambient one.
    expect(summary?.latency).toEqual({ p50: 400, p90: 4_900, p99: 4_900, max: 4_900 });
  });

  it('joins a chat burst by the row\'s own createdAt — ambient chatter joins nothing', () => {
    const beat: BeatRecord = { beatId: 'c1', kind: 'chat-burst', at: '2026-10-23T10:00:02.000Z', t0: 2_000, expectedUsers: 3 };
    const frames: FrameReceipt[] = [
      // The burst's own watermark, carried on every status stream.
      { userId: 1, event: 'chat.activity', at: '2026-10-23T10:00:02.000Z', tReceived: 2_010 },
      { userId: 2, event: 'chat.activity', at: '2026-10-23T10:00:02.000Z', tReceived: 2_020 },
      { userId: 2, event: 'chat.activity', at: '2026-10-23T10:00:02.000Z', tReceived: 2_060 }, // told twice
      // Ambient: a synthetic user's own message, one second either side — not this beat.
      { userId: 1, event: 'chat.activity', at: '2026-10-23T10:00:01.000Z', tReceived: 1_500 },
      { userId: 3, event: 'chat.activity', at: '2026-10-23T10:00:03.000Z', tReceived: 2_500 },
      // user 3 never got the burst's frame — the miss.
    ];
    const [summary] = summarizeDelivery([beat], frames);
    expect(summary?.delivered).toBe(2);
    expect(summary?.expected).toBe(3);
    expect(summary?.duplicateReceipts).toBe(1);
    expect(summary?.latency).toEqual({ p50: 10, p90: 20, p99: 20, max: 20 });
  });
});

describe('summarizeRequests — the row shape of the stress report', () => {
  it('rolls up per route template with failures and the shared percentile method', () => {
    const requests: RequestRecord[] = [
      { route: 'GET /api/teams/:id', status: 200, ms: 30 },
      { route: 'GET /api/teams/:id', status: 200, ms: 50 },
      { route: 'GET /api/teams/:id', status: 500, ms: 400 },
      { route: 'POST /api/fringe/scans', status: 200, ms: 80 },
      { route: 'POST /api/fringe/scans', status: 429, ms: 5 },
    ];
    const routes = summarizeRequests(requests);
    expect(routes.get('GET /api/teams/:id')).toEqual({ calls: 3, failed: 1, p50: 50, p90: 400, p99: 400, max: 400 });
    expect(routes.get('POST /api/fringe/scans')).toEqual({ calls: 2, failed: 1, p50: 5, p90: 80, p99: 80, max: 80 });
  });
});

describe('detectKnee — the capacity claim, reported not passed', () => {
  const step = (over: Partial<RampStepRecord>): RampStepRecord => ({
    users: 0,
    errorRate: 0,
    p95Ms: null,
    streamCapHits: 0,
    fdErrors: 0,
    generatorSkewed: false,
    ...over,
  });

  it('finds the first breaking step, with a fixed precedence', () => {
    const steps = [
      step({ users: 300, errorRate: 0.001, p95Ms: 120 }),
      step({ users: 500, errorRate: 0.001, p95Ms: 900 }),
      // Everything fires at once at 660: the stream cap is the deployment's hard fact.
      step({ users: 660, errorRate: 0.02, p95Ms: 3_000, streamCapHits: 3, fdErrors: 1, generatorSkewed: true }),
    ];
    expect(detectKnee(steps)).toEqual({ kneeUsers: 660, cause: 'stream-cap' });
  });

  it('reports the fd wall as fd-limit — the process of the generator, not the server', () => {
    const steps = [step({ users: 400, fdErrors: 2, errorRate: 0.05 })];
    expect(detectKnee(steps)).toEqual({ kneeUsers: 400, cause: 'fd-limit' });
  });

  it('uses the pre-calibration gates for error rate and latency, and accepts overrides', () => {
    expect(detectKnee([step({ users: 420, errorRate: 0.02 })])).toEqual({ kneeUsers: 420, cause: 'error-rate' });
    expect(detectKnee([step({ users: 430, p95Ms: 2_500 })])).toEqual({ kneeUsers: 430, cause: 'latency' });
    expect(detectKnee([step({ users: 440, errorRate: 0.02 })], { errorRate: 0.05 })).toEqual({ kneeUsers: null, cause: null });
  });

  it('sorts unsorted input and reports no knee on a clean climb', () => {
    const steps = [step({ users: 500, p95Ms: 200 }), step({ users: 300, p95Ms: 100 })];
    expect(detectKnee(steps)).toEqual({ kneeUsers: null, cause: null });
  });
});
