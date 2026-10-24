import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { Cast } from '../support/cast.js';
import { ScaleRun } from '../support/crowd/crowd.js';
import { stamp, typeInto, unique } from '../support/fixtures.js';
import { PORTS } from '../support/playwrightCommon.js';

/**
 * ADR-348/349 — the scale machinery, assembled and proven, before the day rides on it.
 *
 * Three beats: the core cast assembles on the cold stack (ADR-347's path, untouched — the
 * unprunable core); the machinery climbs (monitor → controller → crowd, one way up, until the
 * ceiling or an honest stop) and the telemetry exists; and a scripted departure wave leaves
 * the room standing while ending the climb for good.
 *
 * The gates (plan §6) are exercised on purpose: the collective check sits behind
 * `guarantee(k)` and skips with a reason when it cannot be met; each extra's check is
 * self-relative plus its visibility to one named core member. What this skeleton deliberately
 * does NOT have is the day — that is the next phase, and its first live run on the MacBook
 * owns the calibration (plan §4's bands are hints, not truth).
 */

const BASE_URL = `http://127.0.0.1:${PORTS.scale.web}`;
const TELEMETRY_DIR = 'test-results-scale';
/** A shakeout default; the day spec takes the plan's 120. Raise to stress the machine. */
const CEILING = Number.parseInt(process.env['PSD_E2E_SCALE_CEILING'] ?? '25', 10);

let cast: Cast;
let run: ScaleRun;

test.afterAll(async () => {
  await run?.close();
  await cast?.close();
});

test.describe('the scale orchestrator — assembly, climb, and a departure', () => {
  test.describe.configure({ mode: 'serial' });

  test('the core cast assembles on the cold stack', async ({ browser, request }) => {
    test.setTimeout(120_000);
    cast = await Cast.open(browser, [{ as: 'participant', name: 'pilot', request, nickname: unique('Pilot') }]);
    await cast.page('pilot').goto('/social/chat');
    await expect(cast.page('pilot').getByTestId('chat-panel__draft')).toBeVisible();
  });

  test('the machinery climbs and settles honestly', async () => {
    test.setTimeout(10 * 60_000);
    run = await ScaleRun.open({ baseURL: BASE_URL, telemetryDir: TELEMETRY_DIR, admission: { ceiling: CEILING } });

    // Settled = the ceiling, or a stop with a reason. The climb itself is monotone by
    // construction (ADR-349) — this poll only waits for it to END, not to dip.
    await expect
      .poll(() => (run.state.stopped !== null || run.state.alive === CEILING ? 'settled' : 'climbing'), {
        timeout: 8 * 60_000,
      })
      .toBe('settled');

    // The attribution artifact exists and every line is a stamped record (plan §3 H2).
    const lines = (await readFile(join(TELEMETRY_DIR, 'telemetry.jsonl'), 'utf8')).trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { kind: string; t: number };
      expect(['sample', 'sample-error', 'event']).toContain(parsed.kind);
      expect(parsed.t).toBeGreaterThan(0);
    }

    // Monotone bookkeeping: the crowd's truth matches the controller's, and ids never reuse.
    expect(run.state.alive).toBe(run.crowd.alive);
    expect(run.state.admitted).toBeGreaterThanOrEqual(run.state.alive);

    // Tier C — behind guarantee(k), or an honest skip with the reason (the gate rule).
    const k = Math.min(3, CEILING);
    const guaranteed = await run.guarantee(k);
    test.skip(!guaranteed, `could not guarantee ${k} extras — the climb stopped: ${run.state.stopped ?? 'unknown'}`);

    // Park the speakers' scripts at a safe point, so the spec — not the script — drives them.
    const pilot = cast.page('pilot');
    const speakers = run.crowd.list().slice(0, k);
    await run.crowd.hold(speakers.map((extra) => extra.id));
    try {
      for (const extra of speakers) {
        await extra.page.goto('/social/chat');
        const said = `extra #${extra.id} checking in ${unique('beat')}`;
        await typeInto(extra.page.getByTestId('chat-panel__draft'), said);
        await extra.page.getByTestId('chat-panel__send').click();
        // Tier B — self-relative: the extra sees its own message…
        await expect(extra.page.getByTestId('chat-panel__message').filter({ hasText: said })).toBeVisible({
          timeout: 15_000,
        });
        // …and a named core member sees it too: the pilot.
        await expect(pilot.getByTestId('chat-panel__message').filter({ hasText: said })).toBeVisible({
          timeout: 15_000,
        });
      }
    } finally {
      run.crowd.release(speakers.map((extra) => extra.id));
    }
    await pilot.screenshot({ path: `screenshots/ft-scale-room-${stamp()}.png` });
  });

  test('a departure wave leaves the room standing, and the climb never resumes', async () => {
    test.setTimeout(180_000);
    const before = run.state.alive;
    const wave = Math.min(2, before);
    test.skip(wave === 0, 'no extras alive to depart');
    const stoppedBefore = run.state.stopped;

    const departed = await run.departWave(wave);
    expect(departed).toBe(wave);
    expect(run.state.alive).toBe(before - wave);
    expect(run.state.stopped, 'departures end the climb (ADR-349)').toBeTruthy();
    if (stoppedBefore === null) {
      expect(run.state.stopped).toContain('departures');
    }

    // The room survives on core: the pilot can still speak and be heard.
    const pilot = cast.page('pilot');
    const still = `pilot still here ${unique('beat')}`;
    await typeInto(pilot.getByTestId('chat-panel__draft'), still);
    await pilot.getByTestId('chat-panel__send').click();
    await expect(pilot.getByTestId('chat-panel__message').filter({ hasText: still })).toBeVisible({
      timeout: 15_000,
    });
  });
});
