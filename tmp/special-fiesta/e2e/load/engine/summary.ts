/**
 * ADR-350 — the summary maths (the plan's §8, `summary.ts`): pure joins and percentiles over
 * the run's JSONL records, so the numbers a report prints are the numbers a test can prove.
 *
 * Three rules are the honesty of the whole tier:
 *
 * 1. **Percentiles match `npm run stress`** — the same nearest-rank method as
 *    `scripts/stress/metrics.mjs`, and the same p50/p90/p99/max columns, so the two reports
 *    can be set side by side and mean the same thing by the same definition.
 * 2. **Delivery counts every receipt; latency does not.** A receipt flagged `lagged` (its
 *    worker's event loop was stalled > 50 ms) still proves the frame arrived — it is counted
 *    as delivered — but it is excluded from the latency percentiles, because a stalled
 *    generator must not be allowed to bill its own stall to the server. A user told twice
 *    (the "told twice, never zero times" bargain in `routes-status/stream.ts`) is counted
 *    once, at the first telling.
 * 3. **Knee thresholds are pre-calibration defaults** (plan §9): the plan's own rule is that
 *    no delivery SLO is asserted until the first live runs on the MacBook produce a baseline.
 *    Every threshold here is a parameter, and the calibration ADR supersedes the defaults.
 */

/** Nearest-rank percentile over an ASCENDING-sorted array — mirrors scripts/stress/metrics.mjs. */
export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function statsOf(latencies: readonly number[]): { p50: number; p90: number; p99: number; max: number } | null {
  if (latencies.length === 0) return null;
  const sorted = [...latencies].sort((a, b) => a - b);
  return { p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9), p99: percentile(sorted, 0.99), max: sorted[sorted.length - 1] ?? 0 };
}

/**
 * The beat kinds, and the join each one owns — stated once, so `summary.ts` cannot silently
 * pick another strategy when a versioned frame lands someday:
 *
 * - `announcement` — joins by the run-tagged nonce the body carries (§4).
 * - `leaderboard` — the standalone scan shape: each user's first leaderboard frame at or after
 *   `t0` whose standings touch `clusterCode` (frames carry no version; the rule is frozen).
 * - `match-result` — cast mode's court match: each user's first leaderboard frame at or after
 *   `t0`, unrestricted, because a completed match moves the whole board (ADR-131 B6 — the
 *   completion is the ordinary act that pushes it; the Phase-3 finding closed here).
 * - `up-soon` — the match's aftermath: each user's first `team.upsoon` frame at or after `t0`.
 *   The watcher publishes transitions within `UPSOON_WATCH_MS` (ADR-121/282), and the expected
 *   set is the teams entering the window — the leaving teams' clearing frames are recorded but
 *   are not this beat's delivery claim.
 * - `chat-burst` — the room's watermark moving: each user's first `chat.activity` frame whose
 *   `at` equals the burst's own `createdAt` (ADR-125 — the frame carries the row's time, so
 *   ambient chatter joins nothing).
 */
export type BeatKind = 'announcement' | 'leaderboard' | 'match-result' | 'up-soon' | 'chat-burst';

export interface BeatRecord {
  beatId: string;
  kind: BeatKind;
  /** Announcement beats: the run-tagged nonce the body carries. */
  nonce?: string;
  t0: number;
  /** How many users were live when the beat fired — a user who never received is silence, not a row. */
  expectedUsers: number;
  /**
   * Leaderboard beats only: the scanned participant's cluster. Leaderboard frames carry no
   * version (the plan's §4 froze this), so the join is "each user's first leaderboard frame
   * after t0 that touches this cluster".
   */
  clusterCode?: string;
  /** Chat-burst beats only: the burst message's `createdAt` (ISO) — `chat.activity` carries it. */
  at?: string;
}

export interface FrameReceipt {
  userId: number;
  event: string;
  nonce?: string;
  tReceived: number;
  lagged?: boolean;
  /** Leaderboard frames: the cluster codes this frame's standings touch. */
  clusters?: readonly string[];
  /** `chat.activity` frames: the row's own `createdAt` (ADR-125), which the burst join matches. */
  at?: string;
  /** `team.upsoon` frames: true entering the window, false leaving it (the join matches entering). */
  upSoon?: boolean;
}

export interface BeatDelivery {
  beatId: string;
  kind: string;
  expected: number;
  delivered: number;
  ratio: number;
  /** Receipts beyond the first per user — the "told twice" bargain, counted so it stays visible. */
  duplicateReceipts: number;
  /** Deliveries that prove arrival but are excluded from latency (generator-skewed). */
  laggedReceipts: number;
  latency: { p50: number; p90: number; p99: number; max: number } | null;
}

/**
 * The join strategies, stated once. A nonce beat (announcement) joins by its nonce. A
 * leaderboard beat joins by the frozen rule: the leaderboard frames at or after t0 whose
 * standings touch the scanned cluster. A match result joins the leaderboard frames at or
 * after t0, unrestricted — a completion moves the whole board. An up-soon beat joins the
 * `team.upsoon` frames at or after t0 that say TRUE — the entering sentence; the leaving
 * teams' clearing frames are recorded but join nothing. A chat burst joins the
 * `chat.activity` frames whose `at` is the burst's own row time. Every join returns ALL its
 * matching receipts: `summarizeDelivery` takes each user's first and counts the rest as
 * duplicates, which is the "told twice" bargain.
 */
function receiptsFor(
  beat: BeatRecord,
  nonceReceipts: readonly FrameReceipt[],
  frames: readonly FrameReceipt[],
): readonly FrameReceipt[] {
  if (beat.kind === 'leaderboard' && beat.clusterCode !== undefined) {
    const cluster = beat.clusterCode;
    return frames.filter((receipt) => {
      if (receipt.event !== 'leaderboard' || receipt.tReceived < beat.t0) return false;
      return receipt.clusters !== undefined && receipt.clusters.includes(cluster);
    });
  }
  if (beat.kind === 'match-result') {
    return frames.filter((receipt) => receipt.event === 'leaderboard' && receipt.tReceived >= beat.t0);
  }
  if (beat.kind === 'up-soon') {
    return frames.filter(
      (receipt) => receipt.event === 'team.upsoon' && receipt.tReceived >= beat.t0 && receipt.upSoon !== false,
    );
  }
  if (beat.kind === 'chat-burst') {
    const at = beat.at ?? '';
    return frames.filter((receipt) => receipt.event === 'chat.activity' && receipt.at === at);
  }
  return nonceReceipts;
}

/** Joins beats to receipts: per beat, who was reached, how late, and how honestly. */
export function summarizeDelivery(
  beats: readonly BeatRecord[],
  frames: readonly FrameReceipt[],
): readonly BeatDelivery[] {
  const byNonce = new Map<string, FrameReceipt[]>();
  for (const receipt of frames) {
    if (receipt.nonce === undefined) continue;
    const bucket = byNonce.get(receipt.nonce);
    if (bucket === undefined) byNonce.set(receipt.nonce, [receipt]);
    else bucket.push(receipt);
  }
  return beats.map((beat) => {
    const receipts = beat.nonce === undefined ? receiptsFor(beat, [], frames) : receiptsFor(beat, byNonce.get(beat.nonce) ?? [], frames);
    const firstPerUser = new Map<number, FrameReceipt>();
    for (const receipt of receipts) {
      const first = firstPerUser.get(receipt.userId);
      if (first === undefined || receipt.tReceived < first.tReceived) firstPerUser.set(receipt.userId, receipt);
    }
    const delivered = firstPerUser.size;
    const latencySamples = [...firstPerUser.values()]
      .filter((receipt) => receipt.lagged !== true)
      .map((receipt) => receipt.tReceived - beat.t0);
    return {
      beatId: beat.beatId,
      kind: beat.kind,
      expected: beat.expectedUsers,
      delivered,
      ratio: beat.expectedUsers === 0 ? 1 : delivered / beat.expectedUsers,
      duplicateReceipts: Math.max(0, receipts.length - delivered),
      laggedReceipts: [...firstPerUser.values()].filter((receipt) => receipt.lagged === true).length,
      latency: statsOf(latencySamples),
    };
  });
}

export interface RequestRecord {
  /** The route TEMPLATE (`GET /api/teams/:id`), never the concrete URL (ADR-025's rule). */
  route: string;
  status: number;
  ms: number;
}

export interface RouteSummary {
  calls: number;
  failed: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
}

/** Per-route latency and failure roll-up — the stress report's row shape, derived identically. */
export function summarizeRequests(requests: readonly RequestRecord[]): ReadonlyMap<string, RouteSummary> {
  const buckets = new Map<string, { latencies: number[]; failed: number }>();
  for (const request of requests) noteRequest(buckets, request);
  const summaries = new Map<string, RouteSummary>();
  for (const [route, bucket] of buckets) {
    const stats = statsOf(bucket.latencies);
    summaries.set(route, {
      calls: bucket.latencies.length,
      failed: bucket.failed,
      p50: stats?.p50 ?? 0,
      p90: stats?.p90 ?? 0,
      p99: stats?.p99 ?? 0,
      max: stats?.max ?? 0,
    });
  }
  return summaries;
}

/** One request into its route's bucket — the shape the spread rule keeps small. */
function noteRequest(buckets: Map<string, { latencies: number[]; failed: number }>, request: RequestRecord): void {
  const bucket = buckets.get(request.route);
  if (bucket === undefined) {
    buckets.set(request.route, { latencies: [request.ms], failed: request.status >= 400 ? 1 : 0 });
    return;
  }
  bucket.latencies.push(request.ms);
  if (request.status >= 400) bucket.failed += 1;
}

export interface RampStepRecord {
  users: number;
  errorRate: number;
  p95Ms: number | null;
  /** HTTP 429s from the stream cap (ADR-324) — the cap working, not a crash. */
  streamCapHits: number;
  /** EMFILE/EAGAIN — the generator's own process hitting the fd wall (plan §4, folded in). */
  fdErrors: number;
  /** True when this step's numbers are generator-skewed and must not be trusted as server truth. */
  generatorSkewed: boolean;
}

export type KneeCause = 'stream-cap' | 'fd-limit' | 'error-rate' | 'latency' | 'generator-skew';

export interface Knee {
  kneeUsers: number | null;
  cause: KneeCause | null;
}

export interface KneeThresholds {
  /** Pre-calibration default: ADR-025's 1 % failure gate. */
  errorRate?: number;
  /** Pre-calibration default: 2 s p95 — a phone waiting two seconds for a frame feels broken. */
  latencyMs?: number;
}

/**
 * The first ramp step where a signal breaks, and which signal broke first. Precedence is
 * fixed and documented: the stream cap and the fd wall are hard facts about the deployment
 * and the generator's own process; error rate and latency are the server's signals; and
 * generator skew is reported last because it discredits the step's other numbers rather than
 * replacing them.
 */
export function detectKnee(steps: readonly RampStepRecord[], thresholds: KneeThresholds = {}): Knee {
  const errorRateGate = thresholds.errorRate ?? 0.01;
  const latencyGate = thresholds.latencyMs ?? 2_000;
  const ordered = [...steps].sort((a, b) => a.users - b.users);
  for (const step of ordered) {
    if (step.streamCapHits > 0) return { kneeUsers: step.users, cause: 'stream-cap' };
    if (step.fdErrors > 0) return { kneeUsers: step.users, cause: 'fd-limit' };
    if (step.errorRate > errorRateGate) return { kneeUsers: step.users, cause: 'error-rate' };
    if (step.p95Ms !== null && step.p95Ms > latencyGate) return { kneeUsers: step.users, cause: 'latency' };
    if (step.generatorSkewed) return { kneeUsers: step.users, cause: 'generator-skew' };
  }
  return { kneeUsers: null, cause: null };
}
