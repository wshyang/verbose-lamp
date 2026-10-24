import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { Cast } from '../support/cast.js';
import { apiSignIn, clearAnnouncements, seeded, stamp, typeInto, unique } from '../support/fixtures.js';
import { PORTS } from '../support/playwrightCommon.js';

/**
 * ADR-350 — the live room at 300 (the plan's §5, Phase 4): the cast-driven load run. The
 * engine (`e2e/load/cli.ts --mode cast`) fields the teams and holds the room — N synthetic
 * participants, every status stream snapshotted before the cast walks in — and this spec
 * plays the day through the screens the day is run on:
 *
 *   1. the desk announces over the room (the announcement beat);
 *   2. the marshal stamps the punter at a station (choreography only — the Phase-3 finding:
 *      a scan pushes no leaderboard frame, so there is no delivery claim to measure);
 *   3. the desk drafts the day over the synthetic teams and the marshal plays one match —
 *      the completion is what moves the board (ADR-131 B6) and the up-soon window (ADR-121);
 *   4. the punter bursts in the room chat (the watermark beat, joined by the row's own time).
 *
 * The engine is a child process: it prints ONE JSON line on stdout when the room is ready,
 * takes beat lines on stdin, and exits non-zero on what is always wrong at any load — a 5xx
 * sign-up, a stream that never snapshots, its own crash, a read-back mismatch. The CAST's
 * assertions are Tier A and never reference a synthetic user; the delivery numbers are a
 * report, not an assertion, until §9's calibration sets thresholds.
 *
 * `PSD_E2E_LOAD_USERS` sets the population (the 25-user shakeout by default; the MacBook's
 * claim run takes 300). `PSD_E2E_LOAD_TEAMS` sets the bracket's size, 8 by default — the
 * tournament is the point of the mode, so the teams are fielded whatever the population is.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const USERS = Number(process.env['PSD_E2E_LOAD_USERS'] ?? '25');
const TEAMS = Number(process.env['PSD_E2E_LOAD_TEAMS'] ?? '8');
const API_TARGET = `http://127.0.0.1:${PORTS.load.api}`;
/** The engine outlives the admission window (30 s) and its own snapshot poll; the shakeout and the claim run both fit. */
const READY_TIMEOUT_MS = 300_000;

/** The ready line the engine owes — the spec's only window into the engine's population. */
interface EngineReady {
  readonly ready: true;
  readonly runId: string;
  readonly users: number;
  readonly teams: readonly string[];
  readonly outDir: string;
}

interface Engine {
  readonly child: ChildProcess;
  ready(): Promise<EngineReady>;
  beat(line: object): void;
  exitCode(timeoutMs: number): Promise<number | null>;
  stderrTail(): string;
  kill(): void;
}

let engine: Engine;
let cast: Cast;
let runId = '';

test.describe('ADR-350 — the live room at 300, through the screens the day is run on', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    "Several live SSE contexts in one browser are the cast suite's own, proven-once shape.",
  );

  test('the room at load: four beats, one cast, N synthetic members', async ({ browser, request }) => {
    test.setTimeout(20 * 60_000);

    // The room first: the engine fields the teams and admits the population, and the cast
    // walks in only once every status stream has said something. An engine that dies before
    // ready fails the spec loudly here — not as a hang later.
    engine = spawnEngine();
    const ready = await engine.ready();
    runId = ready.runId;
    expect(ready.users, 'the engine admitted the whole population').toBe(USERS);
    expect(ready.teams.length, 'the engine fielded the bracket').toBeGreaterThanOrEqual(2);
    console.log(`[load-spec] room ready: ${USERS} users, ${ready.teams.length} teams, run ${runId}`);

    // The cast assembles — three roles through the real UI, while the room is already full.
    const punterName = unique('Punter');
    cast = await Cast.open(browser, [
      { as: 'participant', name: 'punter', request, nickname: punterName },
      { as: 'facilitator', name: 'marshal' },
      { as: 'superadmin', name: 'desk' },
    ]);
    const punter = cast.page('punter');
    const marshal = cast.page('marshal');
    const desk = cast.page('desk');

    // ── Beat 1: the desk announces over the room ─────────────────────────────────────────
    await clearAnnouncements(request);
    const nonce = `${runId.slice(0, 6)}:a1`;
    const body = `The room is full — results at the desk in five [${nonce}]`;
    await desk.goto('/admin/announce');
    await desk.getByTestId('announce__body').fill(body);
    const announcedAt = Date.now();
    await desk.getByTestId('announce__send').click();
    engine.beat({ kind: 'announcement', beatId: 'a1', nonce, t0: announcedAt });
    await expect(desk.getByTestId('announce__row').filter({ hasText: body })).toBeVisible({ timeout: 20_000 });
    // The toast is a fresh mount's fetch (ADR-024's poll is 45–75 s), so the reload is the pattern.
    await punter.reload();
    await expect(punter.getByTestId('announcement-toast__body')).toHaveText(body, { timeout: 20_000 });
    await punter.screenshot({ path: `screenshots/load-announce-${stamp()}.png` });

    // ── Beat 2: the marshal stamps the punter at a station — choreography, no delivery claim
    const stationName = unique('Passport Dash');
    const station = await provisionStation(request, stationName);
    await punter.goto('/home');
    const scanNumber = (await punter.getByTestId('qr-home__scan-number').innerText()).trim();
    await marshal.goto('/staff');
    await marshal.getByTestId('staff-home__station').filter({ hasText: stationName }).click();
    await expect(marshal).toHaveURL(new RegExp(`/staff/activity/${station.activityId}$`));
    await marshal.getByTestId('fringe__open-round').click();
    await expect(marshal.getByTestId('fringe__number')).toBeEnabled({ timeout: 15_000 });
    await typeInto(marshal.getByTestId('fringe__number'), scanNumber);
    await expect(marshal.getByTestId('confirm-dialog__title')).toContainText(punterName);
    await marshal.getByTestId('confirm-dialog__confirm').click();
    await expect(marshal.getByTestId('fringe__log-row').filter({ hasText: punterName })).toBeVisible({ timeout: 15_000 });
    await punter.goto('/me/scans');
    await punter.getByTestId('scan-history-tabs__link').nth(0).click();
    const chop = punter.getByTestId('passport__station').filter({ hasText: stationName }).getByTestId('passport-chop__mark');
    await expect(chop).toBeVisible();
    await punter.screenshot({ path: `screenshots/load-passport-${stamp()}.png` });
    // No beat line: a scan pushes no leaderboard frame (the Phase-3 finding — pushLeaderboard
    // is tournament-only, ADR-131 B6). The stamp is Tier A on the punter's own passport.

    // ── Beat 3: the desk drafts the day; the marshal plays one match ─────────────────────
    const courtId = await provisionCourt(request);
    await desk.goto('/admin/tournament');
    await typeInto(desk.getByTestId('tournament-setup__name'), unique('Load day'));
    await desk.getByTestId('tournament-setup__pick-all').click();
    await desk.getByTestId('tournament-setup__create').click();
    await expect(desk.getByTestId('tournament-setup__start-form')).toContainText(`${ready.teams.length} teams entered`);
    await desk.getByTestId('tournament-setup__third-place').uncheck();
    await desk.getByTestId('tournament-setup__start').click();
    await expect(desk.getByTestId('tournament-scheduler')).toContainText('groups_knockout, active');
    await desk.screenshot({ path: `screenshots/load-day-live-${stamp()}.png`, fullPage: true });

    await marshal.goto(`/staff/court/${courtId}`);
    const speedStart = marshal.getByTestId('court__speed-start').first();
    await expect(speedStart, 'the court was offered no next match').toBeVisible({ timeout: 30_000 });
    await speedStart.click();
    await expect(marshal.getByTestId('court__scoreboard')).toBeVisible();
    await marshal.getByTestId('court__step-a-1').click();
    await expect(marshal.getByTestId('court__score-a')).toHaveText('1');
    await marshal.getByTestId('court__step-b-1').click();
    await expect(marshal.getByTestId('court__score-b')).toHaveText('1');
    await marshal.getByTestId('court__step-a-2').click();
    await expect(marshal.getByTestId('court__score-a')).toHaveText('2');
    const resultAt = Date.now();
    await marshal.getByTestId('court__end').click();
    await marshal.getByTestId('confirm-dialog__confirm').click();
    engine.beat({ kind: 'match-result', beatId: 'm1', t0: resultAt });
    await expect(marshal.getByTestId('court__scoreboard')).toHaveCount(0);
    await desk.reload();
    await expect(desk.getByTestId('tournament-matches__finished')).toContainText('Finished (1)', { timeout: 30_000 });
    await marshal.screenshot({ path: `screenshots/load-court-${stamp()}.png` });

    // ── Beat 4: the punter bursts in the room chat ───────────────────────────────────────
    // Three messages from one page, as fast as the send limiter allows (3 cap, 2 s refill):
    // one sender typing is what a burst from one human actually is.
    const burst = [1, 2, 3].map((turn) => `punter burst ${turn} ${unique('room')}`);
    await punter.goto('/social/chat');
    await expect(punter.getByTestId('chat-panel__draft')).toBeVisible();
    const firstSendAt = Date.now();
    for (const text of burst) {
      await typeInto(punter.getByTestId('chat-panel__draft'), text);
      await punter.getByTestId('chat-panel__send').click();
    }
    // The row's own time is the join (ADR-125): the burst's earliest createdAt, read back
    // through the room's own tail — the same read a reconnecting phone makes.
    const tail = await punter.evaluate(async () => {
      const response = await fetch('/api/chat/messages');
      return (await response.json()) as { messages: { body: string; createdAt: string }[] };
    });
    const sent = tail.messages.filter((message) => burst.includes(message.body));
    expect(sent, 'the room served back every burst message').toHaveLength(burst.length);
    const at = sent.map((message) => message.createdAt).sort()[0] ?? '';
    expect(at).not.toBe('');
    engine.beat({ kind: 'chat-burst', beatId: 'c1', at, t0: firstSendAt });
    for (const text of burst) {
      await expect(punter.getByTestId('chat-panel__message').filter({ hasText: text })).toBeVisible({ timeout: 15_000 });
    }
    await punter.screenshot({ path: `screenshots/load-chat-${stamp()}.png` });

    // ── The run ends: stdin EOF, the engine's own verdict, the report ────────────────────
    engine.child.stdin?.end();
    const code = await engine.exitCode(120_000);
    expect(code, `the engine's own always-wrong list fired:\n${engine.stderrTail()}`).toBe(0);
    const summary = JSON.parse(await readFile(join(ready.outDir, 'summary.json'), 'utf-8')) as {
      delivery: { beatId: string; kind: string; delivered: number; expected: number }[];
      streams: { opened: number; refused: number; withoutSnapshot: number };
      chatMessagesAcknowledged: number;
    };
    // A report, not an assertion (§9): the numbers are printed for the calibration record.
    console.log('[load-spec] delivery by beat (report-only until §9 calibration):');
    for (const beat of summary.delivery) {
      console.log(`[load-spec]   ${beat.beatId} (${beat.kind}): ${beat.delivered}/${beat.expected} delivered`);
    }
    console.log(
      `[load-spec] streams: ${summary.streams.opened} opened, ${summary.streams.refused} refused, ${summary.streams.withoutSnapshot} without a snapshot; chat acknowledged: ${summary.chatMessagesAcknowledged}`,
    );
  });
});

test.afterAll(async () => {
  await cast?.close();
  engine?.kill();
});

/**
 * Spawns the engine the plan's §5 describes: no stack of its own (the spec's webServer is
 * the target), beats on stdin until EOF, exactly one JSON line on stdout when the room is
 * ready. Every engine log goes to stderr, so stdout is a one-line protocol.
 */
function spawnEngine(): Engine {
  const child = spawn(
    process.execPath,
    [
      '--import', 'tsx', 'e2e/load/cli.ts',
      '--mode', 'cast',
      '--target', API_TARGET,
      '--users', String(USERS),
      '--team-spread', String(TEAMS),
      '--window-ms', '30000',
      '--duration-ms', '900000',
    ],
    { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const stderr: string[] = [];
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr.push(chunk.toString());
    if (stderr.length > 60) stderr.shift();
  });
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
  });
  const ready = new Promise<EngineReady>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`the engine never said ready within ${READY_TIMEOUT_MS} ms:\n${stderr.join('')}`));
    }, READY_TIMEOUT_MS);
    const onLine = (line: string): void => {
      if (line.trim() === '') return;
      try {
        const parsed = JSON.parse(line) as EngineReady;
        if (parsed.ready === true) {
          clearTimeout(timer);
          resolve(parsed);
        }
      } catch {
        // Not the ready line — tolerated, though the engine is meant to log on stderr.
      }
    };
    if (child.stdout === null) {
      reject(new Error('the engine was spawned without a stdout pipe'));
      return;
    }
    const lines = createInterface({ input: child.stdout });
    lines.on('line', onLine);
    void exited.then((code) => {
      clearTimeout(timer);
      reject(new Error(`the engine died before ready (exit ${code}):\n${stderr.join('')}`));
    });
  });
  return {
    child,
    ready: () => ready,
    beat: (line: object): void => {
      child.stdin?.write(`${JSON.stringify(line)}\n`);
    },
    exitCode: (timeoutMs: number): Promise<number | null> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`the engine did not exit within ${timeoutMs} ms:\n${stderr.join('')}`)),
          timeoutMs,
        );
        void exited.then((code) => {
          clearTimeout(timer);
          resolve(code);
        });
      }),
    stderrTail: (): string => stderr.join(''),
    kill: (): void => {
      if (child.exitCode === null) child.kill('SIGKILL');
    },
  };
}

/** A station through the app's own API, signed in as the desk (AGENTS-testing.md §6). */
async function provisionStation(request: APIRequestContext, stationName: string): Promise<{ activityId: string }> {
  await apiSignIn(request, '/api/auth/superadmins/signin', seeded.superadmin);
  const created = await request.post('/api/admin/activities', {
    data: { activityName: stationName, awardTiers: [{ label: 'Award', points: 5 }] },
  });
  expect(created.ok(), `creating the station: ${await created.text()}`).toBe(true);
  const { activity } = (await created.json()) as { activity: { id: string } };
  return { activityId: activity.id };
}

/** The venue's one court, as full-event.spec.ts provisions it. */
async function provisionCourt(request: APIRequestContext): Promise<string> {
  await apiSignIn(request, '/api/auth/superadmins/signin', seeded.superadmin);
  const court = await request.post('/api/admin/tournament/courts', { data: { courtNumber: 1, label: 'Court 1' } });
  expect(court.ok(), `creating the court: ${await court.text()}`).toBe(true);
  const { courts } = (await court.json()) as { courts: { id: string; courtNumber: number }[] };
  const courtId = courts.find((row) => row.courtNumber === 1)?.id ?? '';
  expect(courtId).not.toBe('');
  return courtId;
}
