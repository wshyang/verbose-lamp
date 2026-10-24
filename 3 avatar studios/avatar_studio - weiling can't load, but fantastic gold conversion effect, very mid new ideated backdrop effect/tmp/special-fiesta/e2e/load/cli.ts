import { mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { loadOptions, type LoadOptions } from './config.js';
import { newRunId, participantPlan } from './engine/scripts.js';
import { expectedAt, fixedSchedule, rampSchedule } from './engine/schedule.js';
import { Recorder, fileSink, type RecorderWindow } from './engine/recorder.js';
import { fetchTransport } from './engine/fetchTransport.js';
import { detectKnee, percentile, type RampStepRecord } from './engine/summary.js';
import { startLocalStack, waitForHealth } from './target/local.js';
import { readBack } from './target/readBack.js';
import { createFacilitator, fieldTeams, seedFringeActivity, signInSuperadmin, type FacilitatorSession, type StaffSession, type TeamFielding } from './staff/sessions.js';
import { marshalScans, startAnnouncer, startMarshal, type BeatRunner, type MarshalRunner } from './staff/beats.js';
import { countAcknowledgedChat, writeReport, type RampReport } from './report.js';
import { expectedUpSoon, parseBeatLine, readyLineOf, type LineupItem, type UpSoonUser } from './cast.js';
import { ResourceMonitor } from '../support/crowd/resourceMonitor.js';
import type { Transport } from './engine/syntheticUser.js';
import type { LoadWorkerData, WorkerOutcome, WorkerStatus } from './workerEntry.js';

/**
 * ADR-350 — the protocol load tier's CLI (the plan's §4/§5):
 *
 *   npm run load -- --mode standalone --users 300    # claim A: delivery under load
 *   npm run load -- --mode standalone --ramp         # claim B: the knee, reported not passed
 *   npm run load -- --mode cast --target http://…    # Phase 4: the live-room-at-300 spec's engine
 *
 * Standalone mode launches its own scratch own-stack (PGlite wiped on start), fields the
 * staff a real event has, admits the population across worker shards, and plays the beats:
 * run-tagged announcements from the superadmin, seeded scans (with deliberate duplicate
 * re-POSTs) from the marshal. After the stack stops, the read-back compares what the server
 * acknowledged with what it persisted, and the report is written whether the run was clean
 * or not — §9's calibration wants the failures more than the successes.
 *
 * Cast mode attaches to a stack the SPEC owns (`--target`, health-checked, never launched
 * here): it fields the teams, admits the whole population, prints ONE JSON line on stdout
 * (`{"ready":true,…}` — the spec's ready signal; every other log goes to stderr), and then
 * plays only the beats the spec feeds it on stdin until EOF. The cast is the choreographer;
 * the engine holds the room and measures what the room was told.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const WORKER_FILE = join(HERE, 'workerEntry.ts');
/** The load pair's API slot (PORTS.load): web 5179 belongs to the spec's Vite, never to this. */
const API_PORT = 8793;
const SCRATCH_DATA_DIR = '.data/e2e-load';
/** How long the ready gate waits past the admission window before declaring the room stuck. */
const READY_TIMEOUT_MS = 240_000;

main().catch((error: unknown) => {
  console.error(`[load] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const options = loadOptions(process.argv.slice(2));
  if (options.mode === 'cast') {
    await runCastMode(options);
    return;
  }
  const runId = options.runId ?? newRunId();
  const outDir = join(REPO_ROOT, options.outDir, runId);
  mkdirSync(outDir, { recursive: true });
  console.log(`[load] run ${runId}: ${describeRun(options)}`);

  const stack = await startLocalStack({
    apiPort: API_PORT,
    dataDir: SCRATCH_DATA_DIR,
    superadminPasscode: options.superadminPasscode,
    // §12: the ramp's default raises the cap so the knee measures the server, not the cap.
    streamCap: options.ramp ? Math.max(options.streamCap, 5_000) : options.streamCap,
  });
  const transport = fetchTransport(stack.baseUrl);
  const recorder = new Recorder({
    requests: fileSink(join(outDir, 'requests.staff.jsonl')),
    frames: fileSink(join(outDir, 'frames.staff.jsonl')),
    beats: fileSink(join(outDir, 'beats.jsonl')),
    streams: fileSink(join(outDir, 'streams.staff.jsonl')),
  });
  const recorded = recordingTransport(transport, recorder);

  const monitor = new ResourceMonitor({ telemetryPath: join(outDir, 'telemetry.jsonl') });
  await monitor.start();
  await monitor.logEvent({ kind: 'run-start', runId, ramp: options.ramp, users: options.users });

  try {
    const staff = await setUpStaff(recorded, options, runId);
    const admission = options.ramp
      ? rampSchedule({ stepUsers: options.stepUsers, stepMs: options.stepMs, ceiling: options.ceiling })
      : fixedSchedule({ users: options.users, windowMs: options.windowMs });
    const runStart = Date.now();
    const beatContext = {
      transport: recorded,
      recorder,
      runId,
      superadmin: staff.superadmin,
      marshal: staff.facilitator,
      roundId: staff.roundId,
      runStart,
      expectedAt: (tMs: number): number => expectedAt(admission, tMs),
      now: (): number => Date.now(),
    };
    const runners: BeatRunner[] = [startAnnouncer(beatContext, options.windowMs)];
    const marshals: readonly MarshalRunner[] = Array.from({ length: options.marshals }, (_, index) =>
      startMarshal(beatContext, marshalScans({ runId, marshalIndex: index, users: options.users, durationMs: options.durationMs })),
    );
    runners.push(...marshals);

    const context: RunContext = { options, runId, outDir, teamCodes: staff.teamCodes };
    const run = options.ramp ? await runRamp(context) : await runFixed(context);

    for (const runner of runners) await runner.stop();
    await monitor.logEvent({ kind: 'run-end', workersFailed: run.workersFailed });

    await stack.stop();
    console.log('[load] stack stopped; reading the database back');

    const readBackReport = await runReadBackguarded(join(REPO_ROOT, 'apps', 'api', SCRATCH_DATA_DIR), {
      acknowledgedScanUuids: marshals.flatMap((marshal) => marshal.acknowledgedScanUuids()),
      acknowledgedChatSends: countAcknowledgedChat(outDir),
      runId,
    });
    const failures = readBackReport.checks.filter((check) => !check.ok);
    for (const check of readBackReport.checks) {
      console.log(`[load] read-back ${check.ok ? 'OK  ' : 'FAIL'}: ${check.name} (${check.detail})`);
    }

    const rampReport: RampReport | null = run.ramp === null ? null : { steps: run.ramp, knee: detectKnee(run.ramp) };
    const summary = await writeReport({ options, runId, outDir, ramp: rampReport });
    if (failures.length > 0 || run.workersFailed > 0) {
      console.error(`[load] run ${runId} finished with ${failures.length} read-back failures, ${run.workersFailed} failed users`);
      process.exitCode = 1;
    } else {
      console.log(`[load] run ${runId} finished clean; report: ${join(outDir, 'summary.json')} (${summary.delivery.length} beats)`);
    }
  } finally {
    await monitor.stop().catch(() => undefined);
    await stack.stop();
  }
}

interface RunContext {
  readonly options: LoadOptions;
  readonly runId: string;
  readonly outDir: string;
  readonly teamCodes: readonly string[];
}

/** A read-back crash is reported with its cause — not a bare drizzle query dump. */
async function runReadBackguarded(dataDir: string, expectations: Parameters<typeof readBack>[1]): Promise<ReturnType<typeof readBack> extends Promise<infer R> ? R : never> {
  console.log(`[load] read-back opening ${dataDir} (cwd ${process.cwd()})`);
  try {
    return await readBack(dataDir, expectations);
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    console.error(`[load] read-back crashed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`[load] read-back cause: ${cause instanceof Error ? cause.message : String(cause ?? 'none')}`);
    throw error;
  }
}

interface StaffSetup {
  readonly superadmin: StaffSession;
  readonly facilitator: FacilitatorSession;
  readonly roundId: string;
  readonly teamCodes: readonly string[];
}

async function setUpStaff(transport: Transport, options: LoadOptions, runId: string): Promise<StaffSetup> {
  const superadmin = await signInSuperadmin(transport, options.superadminPasscode);
  const facilitator = await createFacilitator(transport, superadmin, runId);
  const fixture = await seedFringeActivity(transport, superadmin, facilitator);
  const spread = Math.min(options.teamSpread, Math.max(1, Math.floor(options.users / 10)));
  const fielding = await fieldTeams(transport, runId, spread);
  console.log(`[load] staff ready: facilitator ${facilitator.username}, round ${fixture.roundId}, ${fielding.joinCodes.length} teams fielded`);
  return { superadmin, facilitator, roundId: fixture.roundId, teamCodes: fielding.joinCodes };
}

interface RunOutcome {
  readonly workersFailed: number;
  readonly ramp: readonly RampStepRecord[] | null;
}

async function runFixed(context: RunContext): Promise<RunOutcome> {
  const { options, runId, outDir, teamCodes } = context;
  const userIds = Array.from({ length: options.users }, (_, index) => index + 1);
  const shards = splitAcrossShards(userIds, options.shards);
  const workers = shards.map((shard, shardIndex) =>
    spawnWorker({
      mode: 'fixed',
      shardIndex,
      runId,
      userIds: shard,
      baseUrl: `http://127.0.0.1:${API_PORT}`,
      outDir,
      planOptions: { durationMs: options.durationMs, teamSpread: options.teamSpread },
      windowMs: options.windowMs,
      teamCodes,
    }),
  );
  const outcomes = await Promise.all(workers.map((worker) => worker.done));
  await Promise.all(workers.map((worker) => worker.terminate()));
  return {
    workersFailed: outcomes.reduce((sum, outcome) => sum + outcome.failed, 0),
    ramp: null,
  };
}

async function runRamp(context: RunContext): Promise<RunOutcome> {
  const { options, runId, outDir, teamCodes } = context;
  const steps = rampSchedule({ stepUsers: options.stepUsers, stepMs: options.stepMs, ceiling: options.ceiling });
  const workers = Array.from({ length: options.shards }, (_, shardIndex) =>
    spawnWorker({
      mode: 'ramp',
      shardIndex,
      runId,
      baseUrl: `http://127.0.0.1:${API_PORT}`,
      outDir,
      planOptions: { durationMs: options.durationMs, teamSpread: options.teamSpread },
      teamCodes,
    }),
  );
  const stepRecords: RampStepRecord[] = [];
  let admitted = 0;
  let nextUserId = 1;
  for (const [stepIndex, step] of steps.entries()) {
    console.log(`[load] ramp step ${stepIndex + 1}/${steps.length}: +${step.admit} users (total ${admitted + step.admit})`);
    const batch = Array.from({ length: step.admit }, () => nextUserId++);
    for (const [workerIndex, worker] of workers.entries()) {
      worker.post({ kind: 'admit', userIds: batch.filter((_, index) => index % workers.length === workerIndex) });
    }
    admitted += step.admit;
    await sleep(options.stepMs);
    const windows = await Promise.all(workers.map((worker) => worker.stats()));
    stepRecords.push(stepRecordOf(admitted, windows));
    const knee = detectKnee(stepRecords);
    if (knee.kneeUsers !== null) {
      console.log(`[load] knee at ${knee.kneeUsers} users (${knee.cause}) — stopping the climb`);
      break;
    }
  }
  for (const worker of workers) worker.post({ kind: 'finish' });
  const outcomes = await Promise.all(workers.map((worker) => worker.done));
  await Promise.all(workers.map((worker) => worker.terminate()));
  return {
    workersFailed: outcomes.reduce((sum, outcome) => sum + outcome.failed, 0),
    ramp: stepRecords,
  };
}

/*
 * ADR-350 — cast mode (the plan's §5, Phase 4): the engine behind the live-room-at-300 spec.
 * No stack is launched (the spec owns one, health-checked here), no staff beats are played
 * (the cast's own desk and marshal are the actors), and the only stdout is the ready line —
 * every log goes to stderr so the spec can read the one line that matters. The mode is three
 * moves, each its own function: open the room, take the beats, deliver the verdict.
 */
async function runCastMode(options: LoadOptions): Promise<void> {
  const runId = options.runId ?? newRunId();
  const outDir = join(REPO_ROOT, options.outDir, runId);
  mkdirSync(outDir, { recursive: true });
  const log = (line: string): void => {
    console.error(`[load] ${line}`);
  };
  log(`run ${runId}: cast mode against ${options.target} — ${options.users} users over a ${options.windowMs} ms window, ${options.durationMs} ms horizon`);

  await waitForHealth(options.target, 60_000);
  log(`target healthy: ${options.target}`);

  const transport = fetchTransport(options.target);
  const recorder = new Recorder({
    requests: fileSink(join(outDir, 'requests.staff.jsonl')),
    frames: fileSink(join(outDir, 'frames.staff.jsonl')),
    beats: fileSink(join(outDir, 'beats.jsonl')),
    streams: fileSink(join(outDir, 'streams.staff.jsonl')),
  });
  const monitor = new ResourceMonitor({ telemetryPath: join(outDir, 'telemetry.jsonl') });
  await monitor.start();
  await monitor.logEvent({ kind: 'run-start', runId, ramp: false, users: options.users });

  try {
    const room = await openCastRoom({ options, runId, outDir, recorder, transport, log });
    const workersFailed = await runCastBeats(room);
    await monitor.logEvent({ kind: 'run-end', workersFailed });
    const failures = await castVerdict({ room, workersFailed, log });
    if (failures.length > 0) {
      console.error(`[load] run ${runId} finished with failures: ${failures.join('; ')}`);
      process.exitCode = 1;
    } else {
      log(`run ${runId} finished clean; report: ${join(outDir, 'summary.json')}`);
    }
  } finally {
    await monitor.stop().catch(() => undefined);
  }
}

/** The room the cast walks into: staffed, fielded, admitted, and ready — or a loud failure. */
interface CastRoom {
  readonly options: LoadOptions;
  readonly runId: string;
  readonly outDir: string;
  readonly recorder: Recorder;
  readonly recorded: Transport;
  readonly rawTransport: Transport;
  readonly workers: readonly WorkerHandle[];
  readonly superadmin: StaffSession;
  readonly fielding: TeamFielding;
  readonly userFacts: readonly UpSoonUser[];
  readonly admission: readonly { atMs: number; admit: number }[];
  readonly runStart: number;
  readonly log: (line: string) => void;
}

async function openCastRoom(input: {
  readonly options: LoadOptions;
  readonly runId: string;
  readonly outDir: string;
  readonly recorder: Recorder;
  readonly transport: Transport;
  readonly log: (line: string) => void;
}): Promise<CastRoom> {
  const { options, runId, outDir, recorder, transport, log } = input;
  const recorded = recordingTransport(transport, recorder);

  // The staff a cast-mode run still needs: a superadmin to read with, captains to field the
  // teams. The marshal and the announcer are the CAST's — a facilitator scanning through the
  // UI and a desk announcing through the console are the point of the mode. The spread is
  // the flag's own, not tied to the population: the tournament needs its bracket at any N.
  const superadmin = await signInSuperadmin(recorded, options.superadminPasscode);
  const spread = Math.min(options.teamSpread, 64);
  const fielding = await fieldTeams(recorded, runId, spread);
  log(`teams fielded: ${fielding.joinCodes.length} (captain-led; the tournament's entrants)`);

  const workers = Array.from({ length: options.shards }, (_, shardIndex) =>
    spawnWorker({
      mode: 'ramp',
      shardIndex,
      runId,
      baseUrl: options.target,
      outDir,
      planOptions: { durationMs: options.durationMs, teamSpread: options.teamSpread },
      teamCodes: fielding.joinCodes,
    }),
  );

  // Admission: the standalone mode's fixed schedule, posted by hand — the cast's workers
  // wait for the choreographer, so the window is the engine's to keep honest.
  const admission = fixedSchedule({ users: options.users, windowMs: options.windowMs });
  const runStart = Date.now();
  const admitAt: number[] = Array.from({ length: options.users + 1 }, () => runStart);
  let nextUserId = 1;
  for (const [stepIndex, step] of admission.entries()) {
    const waitMs = runStart + step.atMs - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    const postedAt = Date.now();
    const batch: number[] = [];
    for (let taken = 0; taken < step.admit; taken += 1) batch.push(nextUserId++);
    for (const userId of batch) admitAt[userId] = postedAt;
    for (const [workerIndex, worker] of workers.entries()) {
      worker.post({ kind: 'admit', userIds: batch.filter((_, index) => index % workers.length === workerIndex) });
    }
    log(`admitted ${nextUserId - 1}/${options.users} (step ${stepIndex + 1}/${admission.length})`);
  }

  // The up-soon expectation's per-user facts, built once from the same pure plans the
  // workers execute — the prefix property is what makes this the same run they walked.
  const userFacts: UpSoonUser[] = Array.from({ length: options.users }, (_, index) => {
    const userId = index + 1;
    const plan = participantPlan(runId, userId, { durationMs: options.durationMs, teamSpread: options.teamSpread });
    const join = plan.actions.find((action) => action.kind === 'join-team');
    const teamIndex =
      join !== undefined && join.kind === 'join-team' && join.teamIndex < fielding.joinCodes.length ? join.teamIndex : null;
    return {
      userId,
      teamIndex,
      joinAtMs: join !== undefined ? join.atMs : null,
      admitAt: admitAt[userId] ?? runStart,
    };
  });

  await awaitCastReady(workers, options, log);
  process.stdout.write(`${JSON.stringify(readyLineOf({ runId, users: options.users, teams: fielding.teamNames, outDir }))}\n`);
  log('room ready — taking beats from stdin until EOF');
  return {
    options,
    runId,
    outDir,
    recorder,
    recorded,
    rawTransport: transport,
    workers,
    superadmin,
    fielding,
    userFacts,
    admission,
    runStart,
    log,
  };
}

/** Stdin until EOF: one beat per line, then finish the workers whatever the last line did. */
async function runCastBeats(room: CastRoom): Promise<number> {
  let workersFailed = 0;
  try {
    const lines = createInterface({ input: process.stdin });
    for await (const line of lines) {
      if (line.trim() === '') continue;
      await playCastBeat(castBeatContextOf(room, line));
    }
  } finally {
    // Even a beat line that threw must not strand the workers — but the assignment (not a
    // return) keeps the throw alive, so a lost beat still fails the run loudly.
    workersFailed = await finishCastWorkers(room);
  }
  return workersFailed;
}

/** The workers' outcome, after every live user has been stopped and every thread reaped. */
async function finishCastWorkers(room: CastRoom): Promise<number> {
  for (const worker of room.workers) worker.post({ kind: 'finish' });
  const outcomes = await Promise.all(room.workers.map((worker) => worker.done));
  await Promise.all(room.workers.map((worker) => worker.terminate()));
  const workersFailed = outcomes.reduce((sum, outcome) => sum + outcome.failed, 0);
  room.log(`workers finished: ${workersFailed} failed user(s)`);
  return workersFailed;
}

/** The per-line view of the room `playCastBeat` needs — the same room, one line at a time. */
function castBeatContextOf(room: CastRoom, line: string): CastBeatContext {
  return {
    line,
    recorder: room.recorder,
    admission: room.admission,
    runStart: room.runStart,
    fielding: room.fielding,
    userFacts: room.userFacts,
    superadmin: room.superadmin,
    transport: room.recorded,
    runId: room.runId,
    log: room.log,
  };
}

/**
 * The run's verdict: the read-back, the report, and the always-wrong list. Returns the
 * failures (empty means clean) and leaves the exit code for the caller to set.
 */
async function castVerdict(input: { readonly room: CastRoom; readonly workersFailed: number; readonly log: (line: string) => void }): Promise<readonly string[]> {
  const { room, workersFailed, log } = input;
  // §7's read-back, through the API door: the stack still runs (the spec owns its life), and
  // PGlite is single-connection, so the database door is closed — but "the server still says
  // back what it acknowledged" is the same claim one level up, on the route the room reads.
  // The walk uses the raw transport on purpose: its pages carry concrete cursors, and the
  // recorder's rule is route TEMPLATES (ADR-025), which the beats' reads keep and this walk
  // would not.
  const acknowledged = countAcknowledgedChat(room.outDir);
  const remembered = await countRememberedChat(room.rawTransport, room.superadmin, room.runId);
  log(`read-back (API door): ${acknowledged} acknowledged chat sends, ${remembered} still on the wall`);

  const summary = await writeReport({ options: room.options, runId: room.runId, outDir: room.outDir, ramp: null, log });
  const failures: string[] = [];
  if (workersFailed > 0) failures.push(`${workersFailed} user(s) failed — a 5xx signup is always wrong`);
  if (summary.streams.withoutSnapshot > 0) failures.push(`${summary.streams.withoutSnapshot} stream(s) never delivered a snapshot`);
  if (remembered < acknowledged) failures.push(`read-back mismatch: ${acknowledged} acknowledged, ${remembered} remembered`);
  if (failures.length === 0) log(`report: ${join(room.outDir, 'summary.json')} (${summary.delivery.length} beats)`);
  return failures;
}

/**
 * The ready gate: every user's status stream has said something. A user that failed (the 5xx
 * signup that is always wrong) fails the run NOW rather than timing out; a worker that dies
 * fails it loudly through the same poll.
 */
async function awaitCastReady(workers: readonly WorkerHandle[], options: LoadOptions, log: (line: string) => void): Promise<void> {
  const deadline = Date.now() + options.windowMs + READY_TIMEOUT_MS;
  for (;;) {
    const statuses = await Promise.all(workers.map((worker) => worker.status()));
    const snapshotted = statuses.reduce((sum, status) => sum + status.snapshotted, 0);
    const failed = statuses.reduce((sum, status) => sum + status.failed, 0);
    if (failed > 0) throw new Error(`cast mode cannot go ready: ${failed} user(s) already failed`);
    if (snapshotted >= options.users) return;
    if (Date.now() > deadline) {
      throw new Error(`cast mode never became ready: ${snapshotted}/${options.users} status streams snapshotted within ${options.windowMs + READY_TIMEOUT_MS} ms`);
    }
    log(`waiting for the room: ${snapshotted}/${options.users} snapshotted`);
    await sleep(500);
  }
}

interface CastBeatContext {
  readonly line: string;
  readonly recorder: Recorder;
  readonly admission: readonly { atMs: number; admit: number }[];
  readonly runStart: number;
  readonly fielding: TeamFielding;
  readonly userFacts: readonly UpSoonUser[];
  readonly superadmin: StaffSession;
  readonly transport: Transport;
  readonly runId: string;
  readonly log: (line: string) => void;
}

/** One line from the spec, expanded into the beat records the report joins by. */
async function playCastBeat(context: CastBeatContext): Promise<void> {
  const beat = parseBeatLine(context.line);
  const liveExpected = expectedAt(context.admission, beat.t0 - context.runStart);
  if (beat.kind === 'announcement') {
    context.recorder.recordBeat({ beatId: beat.beatId, kind: 'announcement', nonce: beat.nonce, t0: beat.t0, expectedUsers: liveExpected });
    context.log(`beat ${beat.beatId}: announcement ${beat.nonce} (t0 ${beat.t0}, ${liveExpected} live)`);
    return;
  }
  if (beat.kind === 'chat-burst') {
    context.recorder.recordBeat({ beatId: beat.beatId, kind: 'chat-burst', at: beat.at, t0: beat.t0, expectedUsers: liveExpected });
    context.log(`beat ${beat.beatId}: chat burst at ${beat.at} (t0 ${beat.t0}, ${liveExpected} live)`);
    return;
  }
  // A match result is two claims: the board moved (every stream), and the window moved (the
  // teams now at the front of the line-up — read live, because only the day knows who plays next).
  context.recorder.recordBeat({ beatId: `${beat.beatId}:board`, kind: 'match-result', t0: beat.t0, expectedUsers: liveExpected });
  const { depth, front } = await readLineup(context.transport, context.fielding.captainToken);
  const upSoon = expectedUpSoon({ front, teamNames: context.fielding.teamNames, users: context.userFacts, depth, t0: beat.t0 });
  context.recorder.recordBeat({ beatId: `${beat.beatId}:upsoon`, kind: 'up-soon', t0: beat.t0, expectedUsers: upSoon });
  context.log(`beat ${beat.beatId}: match result (t0 ${beat.t0}) — board to ${liveExpected} live, up-soon to ${upSoon} on the front ${depth} row(s)`);
}

/** The line-up in play order plus the watcher's depth (the enabled courts — ADR-121/282). */
async function readLineup(transport: Transport, captainToken: string): Promise<{ depth: number; front: readonly LineupItem[] }> {
  const courts = await transport.request({ method: 'GET', path: '/api/tournament/courts', token: captainToken });
  if (courts.status !== 200) throw new Error(`GET /api/tournament/courts failed with ${courts.status}`);
  const courtPayload = await courts.json<{ items: { isEnabled: boolean }[] }>();
  const depth = Math.max(1, courtPayload.items.filter((court) => court.isEnabled).length);
  const lineups = await transport.request({ method: 'GET', path: '/api/tournament/lineups', token: captainToken });
  if (lineups.status !== 200) throw new Error(`GET /api/tournament/lineups failed with ${lineups.status}`);
  const payload = await lineups.json<{ items: LineupItem[] }>();
  return { depth, front: payload.items };
}

/**
 * The read-back's other side: how many run-tagged chat rows the server still serves, walked
 * back through the room's own paged read until the wall runs out.
 */
async function countRememberedChat(transport: Transport, superadmin: StaffSession, runId: string): Promise<number> {
  const tag = `ld ${runId.slice(0, 6)} `;
  let before: string | null = null;
  let remembered = 0;
  for (let page = 0; page < 200; page += 1) {
    const response = await transport.request({
      method: 'GET',
      path: before === null ? '/api/chat/messages' : `/api/chat/messages?before=${encodeURIComponent(before)}`,
      token: superadmin.token,
    });
    if (response.status !== 200) throw new Error(`GET /api/chat/messages failed with ${response.status}`);
    const payload = await response.json<{ messages: { id: string; body: string }[]; hasOlder: boolean }>();
    remembered += payload.messages.filter((message) => message.body.startsWith(tag)).length;
    if (!payload.hasOlder || payload.messages.length === 0) return remembered;
    before = payload.messages[payload.messages.length - 1]?.id ?? before;
  }
  throw new Error('the chat wall never ran out after 200 pages — refusing to guess the read-back');
}

function stepRecordOf(users: number, windows: readonly RecorderWindow[]): RampStepRecord {
  const requests = windows.reduce((sum, window) => sum + window.requests, 0);
  const failed = windows.reduce((sum, window) => sum + window.failedRequests, 0);
  const latencies = windows.flatMap((window) => [...window.latencies]).sort((a, b) => a - b);
  const frames = windows.reduce((sum, window) => sum + window.frames, 0);
  const lagged = windows.reduce((sum, window) => sum + window.laggedReceipts, 0);
  return {
    users,
    errorRate: requests === 0 ? 0 : failed / requests,
    p95Ms: latencies.length === 0 ? null : percentile(latencies, 0.95),
    streamCapHits: windows.reduce((sum, window) => sum + window.streamCapRefusals, 0),
    fdErrors: windows.reduce((sum, window) => sum + window.fdRefusals, 0),
    /*
     * A quarter of a WINDOW OF AT LEAST A HUNDRED frames flagged lagged — the pre-calibration
     * default for "the generator's own numbers cannot be trusted for this step" (§9
     * supersedes it). The floor keeps worker boot jank — a handful of early receipts after
     * module load stalls the loop — from claiming skew on a climb's first, smallest step.
     */
    generatorSkewed: frames >= 100 && lagged / frames > 0.25,
  };
}

interface WorkerHandle {
  readonly done: Promise<WorkerOutcome>;
  /** Rejects the moment the worker dies — the cast's ready poll races against it. */
  readonly crashed: Promise<never>;
  post(message: object): void;
  stats(): Promise<RecorderWindow>;
  status(): Promise<WorkerStatus>;
  terminate(): Promise<void>;
}

function spawnWorker(data: LoadWorkerData): WorkerHandle {
  const worker = new Worker(WORKER_FILE, { workerData: data });
  const done = new Promise<WorkerOutcome>((resolve, reject) => {
    worker.on('message', (message: WorkerOutcome | { kind: 'window'; window: RecorderWindow } | WorkerStatus) => {
      if (isOutcome(message)) resolve(message);
    });
    worker.on('error', (error: Error) => reject(error));
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker shard exited with ${code}`));
    });
  });
  // A crash is the same fact for every awaiter; `done` keeps its own copy because a normal
  // finish must not resolve this one.
  const crashed = done.then(
    () => new Promise<never>(() => undefined),
    (error: Error) => Promise.reject(error),
  );
  return {
    done,
    crashed,
    post: (message) => {
      worker.postMessage(message);
    },
    terminate: async () => {
      await worker.terminate();
    },
    stats: () =>
      new Promise<RecorderWindow>((resolve, reject) => {
        const onMessage = (message: WorkerOutcome | { kind: 'window'; window: RecorderWindow } | WorkerStatus): void => {
          if (!isOutcome(message) && message.kind === 'window') {
            worker.off('message', onMessage);
            resolve(message.window);
          }
        };
        worker.on('message', onMessage);
        worker.postMessage({ kind: 'stats' });
        void crashed.then(undefined, (error: Error) => {
          worker.off('message', onMessage);
          reject(error);
        });
      }),
    status: () =>
      new Promise<WorkerStatus>((resolve, reject) => {
        const onMessage = (message: WorkerOutcome | { kind: 'window'; window: RecorderWindow } | WorkerStatus): void => {
          if (message.kind === 'status') {
            worker.off('message', onMessage);
            resolve(message);
          }
        };
        worker.on('message', onMessage);
        worker.postMessage({ kind: 'status' });
        void crashed.then(undefined, (error: Error) => {
          worker.off('message', onMessage);
          reject(error);
        });
      }),
  };
}

function isOutcome(message: WorkerOutcome | { kind: 'window'; window: RecorderWindow } | WorkerStatus): message is WorkerOutcome {
  return (message as WorkerOutcome).kind === 'done';
}

function splitAcrossShards(userIds: readonly number[], shards: number): readonly (readonly number[])[] {
  const buckets: number[][] = Array.from({ length: shards }, () => []);
  for (const [index, userId] of userIds.entries()) buckets[index % shards]!.push(userId);
  return buckets;
}

/** Staff requests are load too: the same recorder, userId 0, route template from the path. */
function recordingTransport(inner: Transport, recorder: Recorder): Transport {
  return {
    async request(spec) {
      const start = Date.now();
      const response = await inner.request(spec);
      recorder.recordRequest(0, { route: `${spec.method} ${spec.path}`, status: response.status, ms: Date.now() - start });
      return response;
    },
    async openStream(spec) {
      return inner.openStream(spec);
    },
  };
}

function describeRun(options: LoadOptions): string {
  return options.ramp
    ? `ramp to ${options.ceiling} by ${options.stepUsers} every ${options.stepMs} ms`
    : `${options.users} users over a ${options.windowMs} ms window, ${options.durationMs} ms horizon`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
