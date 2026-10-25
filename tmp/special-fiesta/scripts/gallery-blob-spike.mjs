/**
 * ADR-048, mitigation **M8** — the spike the assessment said to run before trusting bytes in
 * Postgres. `docs/design/photo-gallery-assessment.md` §7 set the decision rule itself:
 *
 *   "if the M8 spike shows score-write p95 unaffected during a cold-cache gallery burst,
 *    DB-backed is fine and operationally simpler; if not, use the disk + metadata design."
 *
 * The risk being measured (R1/R2) is head-of-line blocking: PGlite runs one serialized connection
 * inside WASM on the main thread, so a burst of blob reads could queue *ahead of* a facilitator
 * submitting a score — and losing scores during a sports day is the failure that matters.
 *
 * What this does: fires a concurrent burst of DISTINCT thumb reads (distinct so the blob cache
 * cannot absorb them) while, in parallel, issuing writes and timing every one. It reports write
 * latency during the burst against a quiet baseline taken first.
 *
 * Run the dev stack, seed a gallery corpus, then:
 *   node scripts/gallery-blob-spike.mjs --burst=200 --concurrency=50
 *
 * Restart the API first for a genuinely cold run: the blob cache lives in the process.
 */

const flags = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);

const BASE = flags.base ?? 'http://127.0.0.1:8787';
const BURST = Number(flags.burst ?? 200);
const CONCURRENCY = Number(flags.concurrency ?? 50);
const WRITES = Number(flags.writes ?? 40);

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[index] * 10) / 10;
}

function summarise(label, values) {
  console.log(
    `${label.padEnd(34)} n=${String(values.length).padStart(4)}  ` +
      `p50 ${String(percentile(values, 50)).padStart(6)}ms  ` +
      `p95 ${String(percentile(values, 95)).padStart(6)}ms  ` +
      `max ${String(percentile(values, 100)).padStart(6)}ms`,
  );
}

async function signIn(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${await response.text()}`);
  return (response.headers.get('set-cookie') ?? '').split(';')[0];
}

/** Times one write. A fringe scan is the cheapest real write path into the event. */
async function timedWrite(cookie, nickname, roundId) {
  const started = performance.now();
  const response = await fetch(`${BASE}/api/fringe/scans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      nickname,
      roundId,
      clientScanUuid: crypto.randomUUID(),
      clientTimestamp: new Date().toISOString(),
    }),
  });
  await response.text();
  return { ms: performance.now() - started, ok: response.status < 400 };
}

async function readThumbs(cookie, ids) {
  const latencies = [];
  let failures = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor];
      cursor += 1;
      const started = performance.now();
      const response = await fetch(`${BASE}/api/gallery/photos/${id}/thumb`, {
        headers: { cookie },
      });
      await response.arrayBuffer();
      latencies.push(performance.now() - started);
      if (!response.ok) failures += 1;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { latencies, failures };
}

async function main() {
  console.log(`\nADR-048 M8 spike -> ${BASE}`);
  const superadmin = await signIn('/api/auth/superadmins/signin', {
    username: 'superadmin',
    passcode: '4242',
  });

  /*
   * Ids come from the moderation read rather than the public listing: the listing is capped at a
   * page (60) by design, and a burst of 60 is not the burst worth fearing. Moderation returns up
   * to 200, so the cold-read count is closer to what a hall full of phones actually produces.
   */
  const listing = await fetch(`${BASE}/api/gallery/moderation`, {
    headers: { cookie: superadmin },
  }).then((r) => r.json());
  const ids = listing.photos.map((photo) => photo.id).slice(0, BURST);
  if (ids.length < 10) {
    console.error('Not enough photos to spike. Seed a gallery corpus first.');
    process.exit(1);
  }

  const staff = await signIn('/api/auth/facilitators/signin', {
    username: flags.facilitator ?? 'fringe1',
    passcode: '1111',
  });
  const activities = await fetch(`${BASE}/api/fringe/activities`, {
    headers: { cookie: staff },
  }).then((r) => r.json());
  const open = (activities.items ?? []).find((item) => item.currentRound?.status === 'open');
  if (!open) {
    console.error('No open fringe round. Run `npm run seed:demo` first.');
    process.exit(1);
  }
  const roundId = open.currentRound.id;
  const victims = listing.photos.map((photo) => photo.uploaderLabel).filter(Boolean);

  // ---- baseline: writes with nothing else happening --------------------------------------
  const quiet = [];
  for (let i = 0; i < WRITES; i += 1) {
    const result = await timedWrite(staff, victims[i % victims.length], roundId);
    if (result.ok) quiet.push(result.ms);
  }

  // ---- the burst: the same writes, while N distinct blobs are read concurrently -----------
  const during = [];
  const burst = readThumbs(superadmin, ids);
  const writeLoop = (async () => {
    for (let i = 0; i < WRITES; i += 1) {
      const result = await timedWrite(staff, victims[i % victims.length], roundId);
      if (result.ok) during.push(result.ms);
    }
  })();
  const [{ latencies, failures }] = await Promise.all([burst, writeLoop]);

  console.log(
    `\n${ids.length} distinct thumbs, concurrency ${CONCURRENCY}, ${failures} read failures\n`,
  );
  summarise('thumb read (from bytea)', latencies);
  summarise('write - quiet baseline', quiet);
  summarise('write - DURING blob burst', during);

  const baseline = percentile(quiet, 95);
  const loaded = percentile(during, 95);
  const delta = baseline === 0 ? 0 : Math.round(((loaded - baseline) / baseline) * 100);
  console.log(
    `\nwrite p95: ${baseline}ms quiet -> ${loaded}ms under burst (${delta >= 0 ? '+' : ''}${delta}%)`,
  );

  /*
   * p95 is the rule §7 wrote down, but reporting only p95 would be misleading, so the tail is
   * called out separately. Head-of-line blocking does not show up as a shifted median: it shows
   * up as ONE unlucky write sitting behind the whole blob queue. A facilitator does not
   * experience a percentile — they experience the scan they are waiting on.
   */
  const quietMax = percentile(quiet, 100);
  const loadedMax = percentile(during, 100);
  const tailRatio = quietMax === 0 ? 0 : loadedMax / quietMax;
  const p95Fine = delta <= 50;
  const tailFine = tailRatio <= 5;

  console.log(`write max: ${quietMax}ms quiet -> ${loadedMax}ms under burst`);
  if (p95Fine && tailFine) {
    console.log('VERDICT: writes unaffected at p95 AND in the tail - DB-backed is safe here.\n');
  } else if (p95Fine) {
    console.log(
      'VERDICT: p95 passes the §7 rule, but the TAIL shows head-of-line blocking (R1): a single\n' +
        '         write can queue behind a cold blob burst. Acceptable only because M3/M4 make a\n' +
        '         cold burst rare; keep the caches, and keep the grid lazy-loading.\n',
    );
  } else {
    console.log('VERDICT: writes degrade under a cold blob burst - revisit the disk design.\n');
  }
}

await main();
