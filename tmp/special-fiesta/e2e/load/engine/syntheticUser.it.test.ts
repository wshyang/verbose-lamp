import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, jsonRequest, seedFringeReady, type TestContext } from '../../../apps/api/src/tests/harness.js';
import { MemorySink, Recorder, type RecordedRequest, type StreamRecord } from './recorder.js';
import { marshalPlan, participantPlan } from './scripts.js';
import { runShard } from './shard.js';
import { summarizeDelivery, type BeatRecord, type FrameReceipt } from './summary.js';
import { SyntheticUser, type Transport } from './syntheticUser.js';

/**
 * ADR-350, Phase 2 — the plan's §11 integration test: N = 25 synthetic users against
 * `createApp()` on an in-memory PGlite through `app.request()` (ADR-046's precedent — the
 * real router, the real database, the real streams, no socket), real DB, real bus. This is
 * the browserless sandbox's proof that the engine drives the actual product and not a mock
 * of it: every user signs up through the API, holds a real status stream, and one
 * announcement must reach every one of them; a marshal's duplicated scan must read back as
 * exactly one row.
 *
 * What this test does NOT claim: latency numbers (the generator and the server share this
 * process, so timings here are not the MacBook's), and no SLO is asserted — §9's calibration
 * has not happened. The hard assertions are the ones the plan calls always-wrong-at-any-load.
 */

const USERS = 25;
const RUN_WINDOW_MS = 1_500;
const PLAN_HORIZON_MS = 9_000;

/** The in-process transport: a Hono app is already a (request → Response) function. */
function honoTransport(ctx: TestContext): Transport {
  return {
    async request(spec) {
      const headers: Record<string, string> = {};
      if (spec.token !== undefined) headers['authorization'] = `Bearer ${spec.token}`;
      if (spec.body !== undefined) headers['content-type'] = 'application/json';
      return ctx.app.request(spec.path, {
        method: spec.method,
        headers,
        ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      });
    },
    async openStream(spec) {
      // ADR-016 — the stream's token rides the query string, as a phone's EventSource must.
      const response = await ctx.app.request(`${spec.path}?session_token=${encodeURIComponent(spec.token)}`);
      if (response.body === null) throw new Error('the stream answered without a body');
      return { status: response.status, body: response.body };
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('ADR-350 phase 2 — synthetic users against the real app', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('delivers one announcement to every held stream, and a duplicated scan stays one row', async () => {
    const fixture = await seedFringeReady(ctx);

    // Two teams fielded by real captains, so the joiners have codes to use at runtime.
    const joinCodes: string[] = [];
    for (let team = 0; team < 2; team += 1) {
      const captain = await ctx.signUpParticipant();
      const made = await ctx.app.request('/api/teams', jsonRequest({ teamName: `ld_${ctx.runId}_t${team}` }, captain.headers));
      expect(made.status).toBe(201);
      joinCodes.push(((await made.json()) as { team: { joinCode: string } }).team.joinCode);
    }

    const sink = new MemorySink();
    const recorder = new Recorder({ requests: sink, frames: sink, beats: sink, streams: sink });
    const runId = `ldit${ctx.runId}`;
    const shard = runShard({
      runId,
      userIds: Array.from({ length: USERS }, (_, index) => index + 1),
      transport: honoTransport(ctx),
      recorder,
      teamCode: (teamIndex) => joinCodes[teamIndex] ?? null,
      planOptions: { durationMs: PLAN_HORIZON_MS, teamSpread: 2 },
      windowMs: RUN_WINDOW_MS,
    });

    // Mid-run beat: every user is admitted inside the window, so by now all hold streams.
    await sleep(RUN_WINDOW_MS + 1_000);
    const superadmin = await ctx.signInSuperadmin();
    // The nonce rides the body in brackets; the join key is the inner runId:beatId text —
    // the same string `nonceIn` extracts on the receiving side.
    const nonce = `${runId.slice(0, 6)}:b1`;
    const t0 = Date.now();
    const announced = await ctx.app.request(
      '/api/admin/announcements',
      jsonRequest({ body: `Desk closes at six sharp [${nonce}]` }, superadmin.headers),
    );
    expect(announced.status).toBe(201);
    recorder.recordBeat({ beatId: 'b1', kind: 'announcement', nonce, t0, expectedUsers: USERS });

    // The marshal's scans — planned, paced, with the deliberate duplicate re-POST (§5).
    // durationMs buys scan slots (one per ~8 s); 24 s buys three, of which every 2nd is a dup.
    const scans = marshalPlan({
      runId,
      marshalIndex: 0,
      targetUserIds: [1, 2, 3],
      duplicateEvery: 2,
      durationMs: 24_000,
    });
    const acknowledgements: { clientScanUuid: string; status: number; duplicate: boolean }[] = [];
    for (const scan of scans) {
      const response = await ctx.app.request(
        '/api/fringe/scans',
        jsonRequest(
          {
            nickname: participantPlan(runId, scan.targetUserId).nickname,
            roundId: fixture.roundId,
            tierLabel: null,
            clientScanUuid: scan.clientScanUuid,
            clientTimestamp: new Date().toISOString(),
          },
          fixture.facilitator.headers,
        ),
      );
      const body = (await response.json()) as { duplicate: boolean };
      acknowledgements.push({ clientScanUuid: scan.clientScanUuid, status: response.status, duplicate: body.duplicate });
      await sleep(200);
    }

    const outcome = await shard;
    expect(outcome.failed).toBe(0);
    expect(outcome.completed).toBe(USERS);

    const rows = sink.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const requests = rows.filter((row) => typeof row['route'] === 'string') as unknown as RecordedRequest[];
    const frames = rows.filter((row) => typeof row['event'] === 'string') as unknown as FrameReceipt[];
    const streams = rows.filter((row) => row['stream'] !== undefined) as unknown as StreamRecord[];
    const beats = rows.filter((row) => typeof row['beatId'] === 'string') as unknown as BeatRecord[];

    // The always-wrong list, at any load: no 5xx anywhere, and every signup made a user.
    expect(requests.filter((request) => request.status >= 500)).toEqual([]);
    const signups = requests.filter((request) => request.route === 'POST /api/auth/participants/signup');
    expect(signups).toHaveLength(USERS);
    expect(signups.every((signup) => signup.status === 201)).toBe(true);

    // A stream that never delivers its snapshot is always wrong (§5). Joiners hold TWO
    // status records — the reconnect after the join attaches the team topic (Phase 4) — so
    // the count is of USERS with a status stream, not of connections.
    const statusStreams = streams.filter((stream) => stream.stream === 'status');
    expect(new Set(statusStreams.map((stream) => stream.userId)).size).toBe(USERS);
    expect(statusStreams.every((stream) => stream.snapshotMs !== null)).toBe(true);
    expect(statusStreams.length).toBeGreaterThan(USERS);

    // The population really spread: some users hold the chat stream, some joined teams.
    expect(streams.some((stream) => stream.stream === 'chat')).toBe(true);
    expect(streams.some((stream) => stream.stream === 'team')).toBe(true);

    // Claim A, small N: the announcement reached every live user, joined by its nonce.
    const [delivery] = summarizeDelivery(beats, frames);
    expect(delivery?.expected).toBe(USERS);
    expect(delivery?.delivered).toBe(USERS);
    expect(delivery?.ratio).toBe(1);
    expect(delivery?.latency).not.toBeNull();

    // The idempotency path under load (§5/§11): the duplicate re-POST was told "duplicate"
    // (200), the fresh ones 201 — and the round's persisted log holds each uuid exactly once.
    const duplicates = acknowledgements.filter((ack) => ack.duplicate);
    const fresh = acknowledgements.filter((ack) => !ack.duplicate);
    expect(fresh.length).toBeGreaterThan(0);
    expect(duplicates.length).toBeGreaterThan(0);
    expect(fresh.every((ack) => ack.status === 201)).toBe(true);
    expect(duplicates.every((ack) => ack.status === 200)).toBe(true);

    const log = await ctx.app.request(`/api/fringe/rounds/${fixture.roundId}/scans`, {
      headers: fixture.facilitator.headers,
    });
    expect(log.status).toBe(200);
    const persisted = ((await log.json()) as { items: { clientScanUuid: string }[] }).items;
    const uuidCounts = new Map<string, number>();
    for (const item of persisted) uuidCounts.set(item.clientScanUuid, (uuidCounts.get(item.clientScanUuid) ?? 0) + 1);
    for (const ack of acknowledgements) {
      expect(uuidCounts.get(ack.clientScanUuid), `scan ${ack.clientScanUuid} persisted exactly once`).toBe(1);
    }
  });

  it('fires the status-snapshot callback once, and records chat.activity by the row\'s own time (Phase 4)', async () => {
    const sink = new MemorySink();
    const recorder = new Recorder({ requests: sink, frames: sink, beats: sink, streams: sink });
    // A different run id from the first test's: the same (runId, userId) pair would collide
    // on the nickname and the signup would answer 409.
    const runId = `ldit2${ctx.runId}`;

    let snapshots = 0;
    const user = new SyntheticUser({
      userId: 1,
      plan: participantPlan(runId, 1, { durationMs: 4_000, teamSpread: 2 }),
      transport: honoTransport(ctx),
      recorder,
      teamCode: () => null,
      onStatusSnapshot: () => {
        snapshots += 1;
      },
    });
    const finished = user.run();

    // The room settles: the status stream connects and delivers its snapshot (ADR-121).
    await sleep(1_000);
    expect(snapshots, 'the ready gate\'s signal fired when the status stream first spoke').toBe(1);

    // A message in the room moves the watermark: every status stream is told the row's own
    // time (ADR-125), which is exactly what the burst join matches.
    const speaker = await ctx.signUpParticipant();
    const said = await ctx.app.request('/api/chat/messages', jsonRequest({ body: `burst probe ${runId}` }, speaker.headers));
    expect(said.status).toBe(201);
    const { message } = (await said.json()) as { message: { createdAt: string } };

    await sleep(800);
    await user.stop();
    await finished;

    const rows = sink.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const frames = rows.filter((row) => typeof row['event'] === 'string') as unknown as FrameReceipt[];
    const activity = frames.filter((frame) => frame.event === 'chat.activity');
    // The user's own plan chats publish activity frames too — every one carries ITS row's
    // time, and the probe message's time is among them, byte-identical (both toISOString()).
    expect(activity.length).toBeGreaterThan(0);
    expect(activity.every((frame) => typeof frame.at === 'string')).toBe(true);
    expect(activity.some((frame) => frame.at === message.createdAt)).toBe(true);

    // The burst join, end to end: the beat carries the row's time, and the receipt matches.
    const beats: BeatRecord[] = [{ beatId: 'c1', kind: 'chat-burst', at: message.createdAt, t0: Date.now() - 2_000, expectedUsers: 1 }];
    const [delivery] = summarizeDelivery(beats, frames);
    expect(delivery?.delivered).toBe(1);
    expect(delivery?.ratio).toBe(1);
  });
});
