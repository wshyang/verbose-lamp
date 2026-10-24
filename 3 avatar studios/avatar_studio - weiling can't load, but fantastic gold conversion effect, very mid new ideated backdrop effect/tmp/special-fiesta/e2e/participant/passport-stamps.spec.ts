import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiSignIn, apiSignUp, seeded, signInParticipant, unique } from '../support/fixtures.js';

/**
 * ADR-239 / ADR-240 / ADR-241 — the passport tab of Scan History, driven as a participant would.
 *
 * Written from the requirement before the screen existed (AGENTS-testing.md §1.1). A facilitator
 * stamps a participant at one station; the participant opens Scan History, takes the Passport tab,
 * and finds the chop on that station and an open slot on the rest. The assertions read what is on
 * screen and what the device has kept, not what the component held in memory.
 */

const STATION_TIER = 'Award';
const STATION_POINTS = 5;
const FACILITATOR = 'court1';

interface Stamped {
  nickname: string;
  pin: string;
  stationId: string;
  stationName: string;
  roundId: string;
}

let stamped: Stamped;

/** The spec makes its own station, named for this run, rather than borrowing one (AGENTS-testing.md §7). */
async function stampAtNewStation(
  request: APIRequestContext,
  walker: { nickname: string; pin: string },
): Promise<{ stationId: string; stationName: string; roundId: string }> {
  await apiSignIn(request, '/api/auth/superadmins/signin', {
    username: seeded.superadmin.username,
    passcode: seeded.superadmin.passcode,
  });
  const stationName = unique('Passport Dash');
  const created = await request.post('/api/admin/activities', {
    data: { activityName: stationName, awardTiers: [{ label: STATION_TIER, points: STATION_POINTS }] },
  });
  expect(created.ok(), `creating the station: ${await created.text()}`).toBe(true);
  const { activity } = (await created.json()) as { activity: { id: string } };

  await apiSignIn(request, '/api/auth/facilitators/signin', {
    username: FACILITATOR,
    passcode: seeded.facilitatorPasscode,
  });
  const round = await request.post(`/api/fringe/activities/${activity.id}/rounds`, { data: {} });
  expect(round.ok(), `opening the round: ${await round.text()}`).toBe(true);
  const { round: openedRound } = (await round.json()) as { round: { id: string } };

  const scan = await request.post('/api/fringe/scans', {
    data: {
      nickname: walker.nickname,
      roundId: openedRound.id,
      tierLabel: STATION_TIER,
      clientScanUuid: crypto.randomUUID(),
      clientTimestamp: new Date().toISOString(),
    },
  });
  expect(scan.status(), `stamping the participant: ${await scan.text()}`).toBe(201);
  return { stationId: activity.id, stationName, roundId: openedRound.id };
}

test.describe('ADR-239 — the passport tab of Scan History', () => {
  test('a participant stamped at a station finds its chop on the Passport tab', async ({ page, request }) => {
    const walker = await apiSignUp(request, { nickname: unique('Pa') });
    const station = await stampAtNewStation(request, walker);
    stamped = { nickname: walker.nickname, pin: walker.pin, ...station };

    await signInParticipant(page, stamped.nickname, stamped.pin);
    await page.goto('/me/scans');
    // The path a participant takes: the list of scans first, then the first tab.
    await page.getByTestId('scan-history-tabs__link').nth(0).click();
    await expect(page).toHaveURL(/\/me\/scans\/passport$/);

    const row = page.getByTestId('passport__station').filter({ hasText: stamped.stationName });
    await expect(row).toHaveCount(1);
    const chop = row.getByTestId('passport-chop__mark');
    await expect(chop).toBeVisible();
    await expect(chop).toHaveAccessibleName('Completed');
    // The chop is ink on the paper, so its blend mode is the one the stylesheet asks for.
    await expect(chop).toHaveCSS('mix-blend-mode', 'multiply');
    const box = await chop.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(90);

    // One completed station is the only chop on the page; every other station is an open slot.
    const stations = await page.getByTestId('passport__station').count();
    const noun = stations === 1 ? 'station' : 'stations';
    await expect(page.getByTestId('passport-chop__mark')).toHaveCount(1);
    await expect(page.getByTestId('passport__pending')).toHaveCount(stations - 1);
    await expect(page.getByText(`1 of ${stations} ${noun} completed`)).toBeVisible();
    await expect(page.getByTestId('scan-history-tabs__link').nth(0)).toHaveAttribute(
      'aria-current',
      'page',
    );

    /*
     * ADR-261 — the same participant plays the same station in its next round. The passport
     * strikes a second chop over the first: same die, a visibly different impression.
     */
    const advanced = await request.post(`/api/fringe/rounds/${stamped.roundId}/advance`, {
      data: {},
    });
    expect(advanced.ok(), `advancing the round: ${await advanced.text()}`).toBe(true);
    const { round: nextRound } = (await advanced.json()) as { round: { id: string } };
    const second = await request.post('/api/fringe/scans', {
      data: {
        nickname: stamped.nickname,
        roundId: nextRound.id,
        tierLabel: STATION_TIER,
        clientScanUuid: crypto.randomUUID(),
        clientTimestamp: new Date().toISOString(),
      },
    });
    expect(second.ok(), `stamping the second round: ${await second.text()}`).toBe(true);

    await page.reload();
    const struck = page.getByTestId('passport__station').filter({ hasText: stamped.stationName });
    const marks = struck.getByTestId('passport-chop__mark');
    await expect(marks).toHaveCount(2);
    await expect(page.getByTestId('passport-chop__mark')).toHaveCount(2);
    const placements = await marks.evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector('g[transform]')?.getAttribute('transform') ?? ''),
    );
    expect(placements[0]).not.toBe(placements[1]);
  });

  test('the same device shows the same chop after a reload, because it kept the seed', async ({ page }) => {
    await signInParticipant(page, stamped.nickname, stamped.pin);
    await page.goto('/me/scans/passport');

    // ADR-261 — the row may carry a stack by now; the first strike is the one whose
    // kept seed this test is about.
    const mark = page
      .getByTestId('passport__station')
      .filter({ hasText: stamped.stationName })
      .getByTestId('passport-chop__mark')
      .first();
    await expect(mark).toBeVisible();
    const before = await mark.locator('g[transform]').first().getAttribute('transform');
    expect(before).toMatch(/rotate\(/u);

    await page.reload();
    await expect(mark).toBeVisible();
    expect(await mark.locator('g[transform]').first().getAttribute('transform')).toBe(before);

    const kept = await page.evaluate(() => window.localStorage.getItem('psd.passportChops.v1'));
    const seeds = JSON.parse(kept ?? '{}') as Record<string, unknown>;
    expect(Number.isInteger(seeds[stamped.stationId])).toBe(true);
  });

  test('a participant with no stamps yet sees every station as an open slot', async ({ page, request }) => {
    const newcomer = await apiSignUp(request, { nickname: unique('Nw') });
    await signInParticipant(page, newcomer.nickname, newcomer.pin);
    await page.goto('/me/scans/passport');

    // Wait for the list, or its empty state, before counting: count() itself does not wait.
    await expect(
      page.getByTestId('passport__station').first().or(page.getByTestId('passport__empty')),
    ).toBeVisible();
    await expect(page.getByTestId('passport-chop__mark')).toHaveCount(0);
    const stations = await page.getByTestId('passport__station').count();
    await expect(page.getByTestId('passport__pending')).toHaveCount(stations);
  });
});
