import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  apiSignIn,
  apiSignUp,
  seeded,
  signInParticipant,
  signInStaff,
  signInSuperadmin,
  stamp,
  typeInto,
  unique,
} from '../support/fixtures.js';

/**
 * ADR-290 — one whole event day on the rebuilt tournament (ADR-270–289), through the screens the day
 * is run on. The successor of ADR-174's spec, which left with the old tournament.
 *
 * It runs on `playwright.full-event.config.ts`: its own PGlite directory, wiped on start, its own
 * ports. Starting a tournament cannot be undone by any UI, so nothing here may reach the shared dev
 * database, and a second run must find a clean one.
 *
 * Division of labour, as `e2e/support/fixtures.ts` sets it: the cast (eight captains, their teams, a
 * court) is provisioned through the app's own APIs; the DAY is played through the UI. The superadmin
 * sets the day up on the Control subtab, the court marshal plays every match on the court console a
 * rally at a time, and the participant reads the result on their own Ball tab.
 *
 * What it proves that the API suites cannot: that the day is REACHABLE. Each button exists, is enabled
 * when it is needed, and leaves the screen ready for the next press — fifteen matches in a row, because
 * the failure this guards against is a console that works once and wedges on the second.
 */

const TEAM_COUNT = 8;
const GROUP_MATCHES = 12;
const KNOCKOUT_MATCHES = 3;
/** The seeded court marshal (`seed-default.sql`). */
const FACILITATOR = 'court1';

interface Cast {
  teamIds: string[];
  captain: string;
  courtId: string;
}

let cast: Cast;

test.describe('ADR-290 — a whole event day on the rebuilt tournament', () => {
  test.describe.configure({ mode: 'serial' });

  test('provisions the cast: eight teams and the venue’s court', async ({ request }) => {
    cast = await provisionCast(request);
    expect(cast.teamIds).toHaveLength(TEAM_COUNT);
  });

  test('the Simulator rehearses the day from the teams registered and the court switched on', async ({ page }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament/simulator');
    await expect(page.getByTestId('simulator__room')).toHaveText(`${TEAM_COUNT} teams registered, 1 courts on`);
    // The default day has a third-place match; this one will not, so rehearse it the same way.
    await expect(page.getByTestId('simulator__row')).toHaveCount(GROUP_MATCHES + KNOCKOUT_MATCHES + 1);
    await page.getByTestId('simulator__third-place').uncheck();
    // Two groups of four play six each, then two semi-finals and a final.
    await expect(page.getByTestId('simulator__row')).toHaveCount(GROUP_MATCHES + KNOCKOUT_MATCHES);
    await page.screenshot({ path: `screenshots/fe-simulator-${stamp()}.png`, fullPage: true });
  });

  test('the superadmin drafts the day on Control and starts it as groups then knockout', async ({ page }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament');
    await typeInto(page.getByTestId('tournament-setup__name'), unique('Sand day'));
    await page.getByTestId('tournament-setup__pick-all').click();
    await page.getByTestId('tournament-setup__create').click();

    await expect(page.getByTestId('tournament-setup__start-form')).toContainText(`${TEAM_COUNT} teams entered`);
    await page.getByTestId('tournament-setup__third-place').uncheck();
    await expect(page.getByTestId('tournament-setup__problem')).toHaveCount(0);
    await page.getByTestId('tournament-setup__start').click();

    await expect(page.getByTestId('tournament-scheduler')).toContainText('groups_knockout, active');
    await expect(page.getByTestId('tournament-matches__queued')).toContainText(`Queued (${GROUP_MATCHES + KNOCKOUT_MATCHES})`);
    await page.screenshot({ path: `screenshots/fe-control-live-${stamp()}.png`, fullPage: true });
  });

  test('the Timetable lays the day on the court, and the marshal’s Line-ups show what is next', async ({ page }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament/timetable');
    await expect(page.getByTestId('timetable__lane')).toHaveCount(1);
    await expect(page.getByTestId('timetable__block')).toHaveCount(GROUP_MATCHES + KNOCKOUT_MATCHES);
    await page.screenshot({ path: `screenshots/fe-timetable-${stamp()}.png`, fullPage: true });

    await signInStaff(page, FACILITATOR);
    await page.goto(`/staff/court/${cast.courtId}/lineups`);
    await expect(page.getByTestId('court-lineups__row')).toHaveCount(GROUP_MATCHES + KNOCKOUT_MATCHES);
    await expect(page.getByTestId('court-lineups__row').first()).toContainText('Up next on this court');
    // The knockout's seats are still to be decided, and say where they will come from.
    await expect(page.getByTestId('court-lineups').getByText(/Winner of #\d+|To be decided/).first()).toBeVisible();
    await page.screenshot({ path: `screenshots/fe-court-lineups-${stamp()}.png`, fullPage: true });
    await page.getByTestId('court-tabs__console').click();
    await expect(page.getByTestId('court__speed-start').first()).toBeVisible();
  });

  test('the marshal plays all twelve group matches, a rally at a time', async ({ page }) => {
    await signInStaff(page, FACILITATOR);
    for (let played = 0; played < GROUP_MATCHES; played += 1) {
      // Draws are legal in a group and must be exercised, so every third match ends level.
      await playOneMatch(page, played % 3 === 2 ? 'draw' : 'a');
    }
  });

  test('the group stage closes by itself, and the knockout is seated from the tables', async ({ page }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament');
    await expect(page.getByTestId('tournament-stages__stage').first()).toContainText('Group stage — completed', { timeout: 30_000 });
    await expect(page.getByTestId('tournament-stages__stage').nth(1)).toContainText('Knockout — active');
    // Both semi-finals now name their teams: no queued semi is still "1st in Group A".
    await expect(page.getByTestId('tournament-matches__queued')).not.toContainText(/in Group [AB]/);
  });

  test('the captain sees the results on the Ball tab and the semi-finals on Line-ups', async ({ page }) => {
    await signInParticipant(page, cast.captain);
    await page.goto('/feed/results');
    await expect(page.getByTestId('match-feed__row')).toHaveCount(GROUP_MATCHES);
    await page.goto('/feed/lineups');
    await expect(page.locator('[data-testid="lineups__row"], [data-testid="lineups__row-mine"]')).toHaveCount(KNOCKOUT_MATCHES);
    await page.screenshot({ path: `screenshots/fe-participant-lineups-${stamp()}.png`, fullPage: true });
  });

  test('the marshal plays both semi-finals and the final', async ({ page }) => {
    await signInStaff(page, FACILITATOR);
    // A knockout cannot end level, so every one of these is played to a winner.
    for (let played = 0; played < KNOCKOUT_MATCHES; played += 1) {
      await playOneMatch(page, 'a');
    }
    await page.goto(`/staff/court/${cast.courtId}`);
    await expect(page.getByTestId('court__speed-start')).toHaveCount(0);
  });

  test('the desk corrects a result with a reason, and the day closes with a podium', async ({ page, request }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament');
    const finished = page.getByTestId('tournament-matches__finished');
    await expect(finished).toContainText(`Finished (${GROUP_MATCHES + KNOCKOUT_MATCHES})`);

    // The oldest group match (finished matches are listed latest first): 2 – 1 becomes 3 – 1.
    const groupRow = finished.getByTestId('tournament-matches__row').filter({ hasText: 'Group stage' }).last();
    await groupRow.getByTestId('tournament-matches__correct').click();
    await typeInto(page.getByTestId('tournament-act__score-a'), '3');
    await typeInto(page.getByTestId('reason-dialog__reason'), 'Scorer missed a rally');
    await page.getByTestId('reason-dialog__confirm').click();
    await expect(page.getByTestId('reason-dialog__reason')).toHaveCount(0);
    await expect(groupRow).toContainText('3 – 1');

    await page.getByTestId('tournament-scheduler__close').click();
    await page.getByTestId('reason-dialog__confirm').click();
    await expect(page.getByTestId('tournament-control__closed')).toBeVisible();

    const standings = await finalStandings(request);
    expect(standings.isProvisional).toBe(false);
    // Champion and runner-up: this day has no third-place match.
    expect(standings.podium).toHaveLength(2);
    await page.goto('/admin/standings');
    await expect(page.getByTestId('final-standings__provisional')).toHaveCount(0);
    await expect(page.getByTestId('final-standings__podium-row')).toHaveCount(2);
    await page.screenshot({ path: `screenshots/fe-final-standings-${stamp()}.png`, fullPage: true });
  });
});

/** Eight captains, eight teams and one court, through the app's own APIs. */
async function provisionCast(request: APIRequestContext): Promise<Cast> {
  const teamIds: string[] = [];
  const captain = unique('Cap0');
  for (let index = 0; index < TEAM_COUNT; index += 1) {
    await apiSignUp(request, { nickname: index === 0 ? captain : unique(`Cap${index}`) });
    const created = await request.post('/api/teams', { data: { teamName: unique(`Squad${index}`).slice(0, 30) } });
    expect(created.ok(), `creating team ${index}: ${await created.text()}`).toBe(true);
    const { team } = (await created.json()) as { team: { id: string } };
    teamIds.push(team.id);
    // Each captain signs out so the next signup owns the cookie jar.
    await request.post('/api/auth/signout', { data: {} });
  }
  await apiSignIn(request, '/api/auth/superadmins/signin', seeded.superadmin);
  const court = await request.post('/api/admin/tournament/courts', { data: { courtNumber: 1, label: 'Court 1' } });
  expect(court.ok(), `creating the court: ${await court.text()}`).toBe(true);
  const { courts } = (await court.json()) as { courts: { id: string; courtNumber: number }[] };
  const courtId = courts.find((row) => row.courtNumber === 1)?.id ?? '';
  expect(courtId).not.toBe('');
  return { teamIds, captain, courtId };
}

/**
 * One match, exactly as a court marshal plays it: speed-start the pair this court is owed, a rally
 * each, then the ending the score allows. If the schedule stopped offering the next pair, the button
 * would not be there and this fails rather than quietly replaying one pair fifteen times.
 */
async function playOneMatch(page: Page, outcome: 'a' | 'draw'): Promise<void> {
  await page.goto(`/staff/court/${cast.courtId}`);
  const speedStart = page.getByTestId('court__speed-start').first();
  await expect(speedStart, 'the court was offered no next match').toBeVisible({ timeout: 30_000 });
  await speedStart.click();
  await expect(page.getByTestId('court__scoreboard')).toBeVisible();

  await page.getByTestId('court__step-a-1').click();
  await expect(page.getByTestId('court__score-a')).toHaveText('1');
  await page.getByTestId('court__step-b-1').click();
  await expect(page.getByTestId('court__score-b')).toHaveText('1');
  if (outcome === 'draw') {
    await page.getByTestId('court__draw').click();
  } else {
    await page.getByTestId('court__step-a-2').click();
    await expect(page.getByTestId('court__score-a')).toHaveText('2');
    await page.getByTestId('court__end').click();
  }
  await page.getByTestId('confirm-dialog__confirm').click();
  // The console is ready for the next pair: the state the next iteration needs.
  await expect(page.getByTestId('court__scoreboard')).toHaveCount(0);
}

async function finalStandings(request: APIRequestContext): Promise<{ isProvisional: boolean; podium: unknown[] }> {
  await apiSignIn(request, '/api/auth/superadmins/signin', seeded.superadmin);
  const response = await request.get('/api/admin/standings/final');
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { standings: { isProvisional: boolean; podium: unknown[] } }).standings;
}
