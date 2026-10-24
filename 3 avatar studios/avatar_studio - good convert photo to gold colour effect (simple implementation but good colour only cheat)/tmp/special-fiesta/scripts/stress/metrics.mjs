/**
 * Sample collection and the report. One sample per HTTP call: which surface asked, how
 * long it took, what came back. Everything else — percentiles, per-second throughput, the
 * herd factor — is derived from those.
 *
 * Workers collect independently and post a plain summary back; the main thread merges
 * them, so nothing here may hold a socket, a timer or a class instance.
 */

/** A bucket per labelled endpoint plus a count per wall-clock second. */
export function createCollector() {
  return { endpoints: new Map(), seconds: new Map(), failures: [] };
}

export function record(collector, sample) {
  const bucket = collector.endpoints.get(sample.label) ?? {
    count: 0,
    failed: 0,
    statuses: {},
    latencies: [],
  };
  bucket.count += 1;
  if (!sample.ok) bucket.failed += 1;
  bucket.statuses[sample.status] = (bucket.statuses[sample.status] ?? 0) + 1;
  bucket.latencies.push(sample.ms);
  collector.endpoints.set(sample.label, bucket);

  const second = Math.floor(sample.at / 1000);
  collector.seconds.set(second, (collector.seconds.get(second) ?? 0) + 1);

  // Keep a handful of real failures — a status code alone never explains one.
  if (!sample.ok && collector.failures.length < 10) {
    collector.failures.push({ label: sample.label, status: sample.status, detail: sample.detail });
  }
}

/** Maps → plain objects, so a worker can post this through structured clone. */
export function toSummary(collector) {
  return {
    endpoints: Object.fromEntries(collector.endpoints),
    seconds: Object.fromEntries(collector.seconds),
    failures: collector.failures,
  };
}

export function mergeSummaries(summaries) {
  const merged = createCollector();
  for (const summary of summaries) {
    for (const [label, bucket] of Object.entries(summary.endpoints)) {
      const target = merged.endpoints.get(label) ?? { count: 0, failed: 0, statuses: {}, latencies: [] };
      target.count += bucket.count;
      target.failed += bucket.failed;
      target.latencies.push(...bucket.latencies);
      for (const [status, count] of Object.entries(bucket.statuses)) {
        target.statuses[status] = (target.statuses[status] ?? 0) + count;
      }
      merged.endpoints.set(label, target);
    }
    for (const [second, count] of Object.entries(summary.seconds)) {
      const key = Number(second);
      merged.seconds.set(key, (merged.seconds.get(key) ?? 0) + count);
    }
    merged.failures.push(...summary.failures);
  }
  return merged;
}

export function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

function statsFor(bucket) {
  const sorted = [...bucket.latencies].sort((a, b) => a - b);
  return {
    count: bucket.count,
    failed: bucket.failed,
    statuses: bucket.statuses,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
  };
}

/**
 * Requests per second across the whole run. The peak against the mean is the number this
 * whole exercise is about: a fleet that polls on a shared interval spikes, a fleet that
 * draws its own delay does not (ADR-024).
 */
export function throughput(seconds, startedAt, endedAt) {
  const from = Math.floor(startedAt / 1000);
  const to = Math.floor(endedAt / 1000);
  const series = [];
  for (let second = from; second <= to; second += 1) series.push(seconds.get(second) ?? 0);
  const total = series.reduce((sum, value) => sum + value, 0);
  const mean = series.length === 0 ? 0 : total / series.length;
  const peak = series.reduce((best, value) => Math.max(best, value), 0);
  return { series, total, mean, peak, herdFactor: mean === 0 ? 0 : peak / mean };
}

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** Compresses the per-second series into one line of blocks, so a spike is visible. */
export function sparkline(series, width = 72) {
  if (series.length === 0) return '';
  const step = Math.max(1, Math.ceil(series.length / width));
  const buckets = [];
  for (let index = 0; index < series.length; index += step) {
    buckets.push(Math.max(...series.slice(index, index + step)));
  }
  const peak = Math.max(...buckets, 1);
  return buckets.map((value) => BLOCKS[Math.min(7, Math.floor((value / peak) * 7.999))]).join('');
}

const pad = (text, width) => String(text).padEnd(width);
const num = (value, width) => String(value).padStart(width);

export function renderReport(input) {
  const { collector, config, startedAt, endedAt, provisioning } = input;
  const flow = throughput(collector.seconds, startedAt, endedAt);
  const rows = [...collector.endpoints.entries()]
    .map(([label, bucket]) => [label, statsFor(bucket)])
    .sort((a, b) => b[1].count - a[1].count);
  const totals = rows.reduce(
    (sum, [, stats]) => ({ count: sum.count + stats.count, failed: sum.failed + stats.failed }),
    { count: 0, failed: 0 },
  );
  const seconds = (endedAt - startedAt) / 1000;

  const lines = [
    '',
    `PSD Active Day — load simulation (${config.users} participants, ${config.facilitators} facilitators, ${config.workers} worker threads)`,
    `target ${config.base} · ${seconds.toFixed(0)}s · poll ${config.poll === 'fixed' ? `fixed ${config.fixedMs / 1000}s, aligned` : `${config.pollMinMs / 1000}–${config.pollMaxMs / 1000}s jittered`}`,
    '',
    `${pad('endpoint', 42)}${num('calls', 7)}${num('fail', 6)}${num('p50', 8)}${num('p90', 8)}${num('p99', 8)}${num('max', 8)}`,
    '─'.repeat(87),
  ];
  for (const [label, stats] of rows) {
    lines.push(
      `${pad(label, 42)}${num(stats.count, 7)}${num(stats.failed, 6)}${num(`${Math.round(stats.p50)}ms`, 8)}${num(`${Math.round(stats.p90)}ms`, 8)}${num(`${Math.round(stats.p99)}ms`, 8)}${num(`${Math.round(stats.max)}ms`, 8)}`,
    );
  }
  lines.push('─'.repeat(87));
  lines.push(`${pad('all', 42)}${num(totals.count, 7)}${num(totals.failed, 6)}`);
  lines.push('');
  const steady = throughput(collector.seconds, startedAt + config.rampMs, endedAt);
  lines.push(`throughput   ${flow.mean.toFixed(1)} req/s mean · ${flow.peak} req/s peak · herd factor ${flow.herdFactor.toFixed(2)}×`);
  // After the ramp every client is on its own clock: this is the number that says whether
  // the fleet arrives as a crowd or as a queue (ADR-024).
  lines.push(`at load      ${steady.mean.toFixed(1)} req/s mean · ${steady.peak} req/s peak · herd factor ${steady.herdFactor.toFixed(2)}×`);
  lines.push(`requests/s   ${sparkline(flow.series)}`);
  if (provisioning) {
    lines.push(`sign-up      ${provisioning.created} created, ${provisioning.existing} already there, ${(provisioning.ms / 1000).toFixed(1)}s`);
  }
  if (collector.failures.length > 0) {
    lines.push('');
    lines.push(`first failures (${collector.failures.length} kept)`);
    for (const failure of collector.failures.slice(0, 8)) {
      lines.push(`  ${failure.status} ${failure.label} — ${failure.detail ?? 'no body'}`);
    }
  }
  lines.push('');
  return { text: lines.join('\n'), flow, steady, rows, totals };
}
