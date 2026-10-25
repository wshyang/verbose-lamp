#!/usr/bin/env node
/**
 * Event-day load simulation: 300 participants, the facilitators working with them, and the
 * two superadmins watching — all driving the real HTTP API at once.
 *
 *   npm run dev            # in another terminal
 *   npm run seed:demo      # activities, facilitators, point config
 *   npm run stress
 *
 *   npm run stress -- --users=300 --duration=120 --workers=4
 *   npm run stress -- --poll=fixed        # the pre-ADR-024 stampede, for comparison
 *   npm run stress -- --scan-rate=6       # a longer queue at every fringe station
 *   npm run stress -- --json=/tmp/run.json
 *
 * It is a client, not a fixture: every request is one a phone could make, with a real
 * session, so the numbers mean what they say. Nothing is written to the database except
 * through the API, and the accounts it creates are prefixed (`stress_0001`) so they are
 * easy to spot on a leaderboard afterwards.
 */

import { cpus } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { Client } from './stress/client.mjs';
import { createCollector, mergeSummaries, record, renderReport, toSummary } from './stress/metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_PATH = join(ROOT, 'scripts', 'stress', 'worker.mjs');

const flags = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);

const config = {
  base: flags.base ?? process.env.PSD_API_TARGET ?? 'http://127.0.0.1:8787',
  users: Number(flags.users ?? 300),
  facilitators: Number(flags.facilitators ?? 12),
  superadmins: Number(flags.superadmins ?? 2),
  durationMs: Number(flags.duration ?? 120) * 1000,
  rampMs: Number(flags.ramp ?? 30) * 1000,
  workers: Number(flags.workers ?? Math.min(6, Math.max(1, cpus().length - 1))),
  poll: flags.poll === 'fixed' ? 'fixed' : 'jitter',
  pollMinMs: Number(flags['poll-min'] ?? 45) * 1000,
  pollMaxMs: Number(flags['poll-max'] ?? 75) * 1000,
  fixedMs: Number(flags['poll-fixed'] ?? 30) * 1000,
  scanRatePerStation: Number(flags['scan-rate'] ?? 2),
  prefix: flags.prefix ?? 'stress',
  teamSize: Number(flags['team-size'] ?? 6),
  pin: flags.pin ?? '1234',
};

const SUPERADMIN = {
  username: process.env.SUPERADMIN_INITIAL_USERNAME ?? 'superadmin',
  passcode: process.env.SUPERADMIN_INITIAL_PASSCODE ?? '4242',
};
const FACILITATOR_PASSCODE = flags['facilitator-passcode'] ?? '1111';
const SIGNUP_CONCURRENCY = 12;

function fail(message, hint) {
  console.error(`\n✖ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/** A load generator pointed at the wrong host is an outage, so remote targets are opt-in. */
function guardTarget() {
  const host = new URL(config.base).hostname;
  const isLocal = ['127.0.0.1', 'localhost', '0.0.0.0', '::1'].includes(host);
  if (!isLocal && flags.force !== 'true') {
    fail(`${config.base} is not a local address.`, 'Re-run with --force if you meant it.');
  }
}

const setupCollector = createCollector();
const admin = new Client({ base: config.base, collector: setupCollector, record, actor: 'setup' });

async function preflight() {
  const health = await admin.call('GET', '/api/health', { label: 'GET /api/health' });
  if (!health.ok) fail(`No API at ${config.base}.`, 'Start it with `npm run dev`.');

  const signedIn = await admin.call('POST', '/api/auth/superadmins/signin', {
    label: 'POST /api/auth/superadmins/signin',
    body: SUPERADMIN,
  });
  if (!signedIn.ok) fail('Superadmin sign-in failed.', 'Check SUPERADMIN_INITIAL_PASSCODE in .env.');

  const pointConfig = await admin.call('GET', '/api/admin/point-config', { label: 'GET /api/admin/point-config' });
  if (pointConfig.payload?.pointConfig == null) {
    fail('Point config is not set, so the event cannot run (fds.md §2.12).', 'Run `npm run seed:demo` first.');
  }

  const activities = await admin.call('GET', '/api/admin/activities', { label: 'GET /api/admin/activities' });
  const facilitators = await admin.call('GET', '/api/admin/facilitators', { label: 'GET /api/admin/facilitators' });
  const clusters = await admin.call('GET', '/api/clusters', { label: 'GET /api/clusters' });
  if ((activities.payload?.items ?? []).length === 0) {
    fail('No activities to play on.', 'Run `npm run seed:demo` first.');
  }
  return {
    activities: activities.payload.items.filter((activity) => activity.isActive !== false),
    facilitators: facilitators.payload?.items ?? [],
    clusters: (clusters.payload?.items ?? []).map((cluster) => cluster.code),
  };
}

/** Sign-ups run in parallel batches; this is the first burst the API ever sees. */
async function provisionParticipants(clusters) {
  const started = Date.now();
  const accounts = Array.from({ length: config.users }, (unused, index) => ({
    nickname: `${config.prefix}_${String(index + 1).padStart(4, '0')}`,
    pin: config.pin,
    clusterCode: clusters[index % clusters.length],
    gender: index % 2 === 0 ? 'female' : 'male',
    avatarVariant: (index % 5) + 1,
    avatarLook: [
      ((index * 3) % 8) + 1, (index % 5) + 1, ((index * 7) % 10) + 1, (index % 3) + 1,
      (index % 5) + 1,
      // ADR-028 — any colour, so the load test exercises the free ones too.
      (0x1000000 + index * 7919 * 37).toString(16).slice(-6),
      (0x1000000 + index * 5011 * 53).toString(16).slice(-6),
    ].join('-'),
  }));

  let created = 0;
  let existing = 0;
  for (let from = 0; from < accounts.length; from += SIGNUP_CONCURRENCY) {
    const batch = accounts.slice(from, from + SIGNUP_CONCURRENCY);
    await Promise.all(batch.map(async (account) => {
      const client = new Client({ base: config.base, collector: setupCollector, record, actor: 'signup' });
      const response = await client.call('POST', '/api/auth/participants/signup', {
        label: 'POST /api/auth/participants/signup',
        body: account,
        tolerate: [409],
      });
      if (response.status === 409) existing += 1;
      else if (response.ok) created += 1;
    }));
    process.stdout.write(`\r  signing up ${Math.min(from + SIGNUP_CONCURRENCY, accounts.length)}/${accounts.length}`);
  }
  process.stdout.write('\r');
  return { accounts, created, existing, ms: Date.now() - started };
}

/** Marshals to log in as, created if the event does not have enough of them yet. */
async function provisionFacilitators(existing) {
  // Staff usernames are letters and numbers only, 4–20 characters (fds.md §2.2).
  const stem = config.prefix.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'load';
  const wanted = Array.from({ length: config.facilitators }, (unused, index) => ({
    username: `${stem}m${String(index + 1).padStart(2, '0')}`,
    passcode: FACILITATOR_PASSCODE,
    displayLabel: `Load marshal ${index + 1}`,
  }));
  const known = new Set(existing.map((account) => account.username));
  for (const account of wanted) {
    if (known.has(account.username)) continue;
    await admin.call('POST', '/api/admin/facilitators', {
      label: 'POST /api/admin/facilitators',
      body: account,
      tolerate: [409],
    });
  }
  return wanted;
}

/**
 * Teams of six, the way the field organises itself before the tournament: one participant
 * creates, the next five join. Re-running is safe — a taken name and a second join both
 * come back 409, and the roster that already exists is used as it is.
 */
async function provisionTeams(accounts, clients) {
  const size = config.teamSize;
  let created = 0;
  for (let from = 0; from + size <= accounts.length; from += size) {
    const squad = accounts.slice(from, from + size);
    const captain = clients.get(squad[0].nickname);
    const made = await captain.call('POST', '/api/teams', {
      label: 'POST /api/teams',
      body: { teamName: `${config.prefix} squad ${String(from / size + 1).padStart(2, '0')}` },
      // On a re-run the name is taken and the captain is already on that team.
      tolerate: [400, 409, 422],
    });
    const teamId = made.payload?.team?.id ?? null;
    if (teamId === null) continue;
    created += 1;
    await Promise.all(squad.slice(1).map((member) => clients.get(member.nickname).call(
      'POST',
      `/api/teams/${teamId}/join`,
      { label: 'POST /api/teams/:id/join', body: {}, tolerate: [400, 409, 422] },
    )));
  }
  return created;
}

/** Signs in every provisioned participant once, so team building can use real sessions. */
async function signInAll(accounts) {
  const clients = new Map();
  for (let from = 0; from < accounts.length; from += SIGNUP_CONCURRENCY) {
    const batch = accounts.slice(from, from + SIGNUP_CONCURRENCY);
    await Promise.all(batch.map(async (account) => {
      const client = new Client({ base: config.base, collector: setupCollector, record, actor: 'setup' });
      await client.call('POST', '/api/auth/participants/signin', {
        label: 'POST /api/auth/participants/signin (setup)',
        body: { nickname: account.nickname, pin: account.pin },
      });
      clients.set(account.nickname, client);
    }));
  }
  return clients;
}

/** Every fringe station needs an open round to scan into (F24). */
async function openRounds(activities, marshal) {
  const client = new Client({ base: config.base, collector: setupCollector, record, actor: 'rounds' });
  await client.call('POST', '/api/auth/facilitators/signin', {
    label: 'POST /api/auth/facilitators/signin',
    body: { username: marshal.username, passcode: marshal.passcode },
  });
  const rounds = [];
  for (const activity of activities) {
    const detail = await client.call('GET', `/api/fringe/activities/${activity.id}`, {
      label: 'GET /api/fringe/activities/:id',
    });
    const open = detail.payload?.activity?.currentRound ?? null;
    if (open !== null && open.status === 'open') {
      rounds.push(open.id);
      continue;
    }
    const opened = await client.call('POST', `/api/fringe/activities/${activity.id}/rounds`, {
      label: 'POST /api/fringe/activities/:id/rounds',
      body: {},
      // "Only one active round per activity" is a 400: the station is already open.
      tolerate: [400, 409],
    });
    if (opened.payload?.round) rounds.push(opened.payload.round.id);
  }
  return rounds;
}

/** Splits the crowd across threads, dealing personas round-robin so no thread is all writes. */
function planAssignments(accounts, marshals) {
  const assignments = accounts.map((account) => ({ persona: 'participant', account }));
  // ADR-270 — every marshal runs a fringe station until the rebuilt tournament has courts again.
  marshals.forEach((account) => assignments.push({ persona: 'fringe', account }));
  for (let index = 0; index < config.superadmins; index += 1) assignments.push({ persona: 'superadmin', account: SUPERADMIN });

  const slices = Array.from({ length: config.workers }, () => []);
  assignments.forEach((assignment, index) => slices[index % config.workers].push(assignment));
  return slices;
}

function runWorkers(slices, world, startAt, deadline) {
  const summaries = [];
  const counts = new Array(slices.length).fill(0);
  const ticker = setInterval(() => {
    const done = counts.reduce((sum, value) => sum + value, 0);
    const left = Math.max(0, deadline - Date.now()) / 1000;
    process.stdout.write(`\r  running — ${done} requests, ${left.toFixed(0)}s left   `);
  }, 1000);

  return Promise.all(slices.map((assignments, index) => new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { config, assignments, world, startAt, deadline },
    });
    worker.on('message', (message) => {
      if (message.type === 'progress') counts[index] = message.done;
      if (message.type === 'done') summaries.push(message.summary);
    });
    worker.on('error', reject);
    worker.on('exit', () => resolve());
  }))).then(() => {
    clearInterval(ticker);
    process.stdout.write('\r');
    return summaries;
  });
}

async function main() {
  guardTarget();
  console.log(`\nPSD Active Day load simulation → ${config.base}`);
  const event = await preflight();
  console.log(`· event ready: ${event.activities.length} activities, ${event.clusters.length} clusters`);

  const provisioning = await provisionParticipants(event.clusters);
  console.log(`· ${config.users} participants (${provisioning.created} new, ${provisioning.existing} existing) in ${(provisioning.ms / 1000).toFixed(1)}s`);

  const marshals = await provisionFacilitators(event.facilitators);
  const rounds = await openRounds(event.activities, marshals[marshals.length - 1]);
  console.log(`· ${marshals.length} marshals, ${rounds.length} open fringe rounds`);

  if (config.teamSize > 0) {
    const sessions = await signInAll(provisioning.accounts);
    const teamsMade = await provisionTeams(provisioning.accounts, sessions);
    console.log(`· ${teamsMade} new teams of ${config.teamSize} (squads that already existed are reused)`);
  }

  if (flags['dry-run'] === 'true') {
    console.log('\n--dry-run: everything is provisioned, no load generated.\n');
    return;
  }

  const world = {
    accounts: provisioning.accounts.map(({ nickname }) => ({ nickname })),
    rounds,
    teams: [],
  };
  const slices = planAssignments(provisioning.accounts, marshals);
  const startAt = Date.now() + 500;
  const deadline = startAt + config.rampMs + config.durationMs;
  console.log(`· ${slices.reduce((sum, slice) => sum + slice.length, 0)} virtual users over ${config.workers} threads, ${config.rampMs / 1000}s ramp, ${config.durationMs / 1000}s at load\n`);

  const summaries = await runWorkers(slices, world, startAt, deadline);
  const collector = mergeSummaries([...summaries, toSummary(setupCollector)]);
  const report = renderReport({ collector, config, startedAt: startAt, endedAt: Date.now(), provisioning });
  console.log(report.text);

  if (flags.json) {
    await writeFile(flags.json, JSON.stringify({
      config,
      startedAt: startAt,
      endedAt: Date.now(),
      throughput: report.flow,
      atLoad: report.steady,
      endpoints: Object.fromEntries(report.rows),
      failures: collector.failures,
    }, null, 2));
    console.log(`json → ${flags.json}\n`);
  }

  // A run that could not keep the event running is a failure, not a report.
  const failureRate = report.totals.count === 0 ? 1 : report.totals.failed / report.totals.count;
  if (failureRate > 0.01) {
    console.error(`✖ ${(failureRate * 100).toFixed(2)}% of requests failed.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
