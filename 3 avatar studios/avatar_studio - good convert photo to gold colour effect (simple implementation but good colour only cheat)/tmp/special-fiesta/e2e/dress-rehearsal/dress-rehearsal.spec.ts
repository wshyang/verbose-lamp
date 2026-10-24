import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiSignIn, apiSignUp, seeded, signInParticipant, signInStaff, signInSuperadmin, stamp, typeInto, unique } from '../support/fixtures.js';

/**
 * ADR-335 — the browser dress rehearsal for the day-of lock-ins (ADR-329 phase 5).
 *
 * The cast and the pipeline are provisioned through the app's APIs, as the full-event spec
 * provisions its cast; every act that can go wrong on the day is then taken through the
 * screen that owns it: the desk awards the walkover, closes the tied groups, reseats the
 * absent qualifier, cuts the knockout from 20 minutes to 12 and hands a live semi-final
 * back, while the marshal plays the matches and settles the level semi-final by coin toss.
 * The seventh is the extraordinary one (ADR-336/340/342): mid-final, a court asks and the
 * desk switches the day to award mode, the matches on court drain, the idle court pays a
 * team while the final is still live, and the bracket ends itself when the last court does.
 *
 * It runs on `playwright.dress-rehearsal.config.ts`, against a wiped database of its own,
 * because it activates the singleton tournament. The same first six mishaps are rehearsed
 * over HTTP in `apps/api/src/tests/tournament-rehearsal.test.ts`, which is the version CI
 * runs; the seventh has its own HTTP suites, and this file is where its whole walk — ask,
 * confirm, drain, award, end — is taken through the screens the room actually touches.
 */

const FACILITATOR = 'court1';

interface Seat {
  teamId: string | null;
  teamName: string | null;
}

interface MatchRow {
  id: string;
  code: string;
  stageLabel: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  courtId: string | null;
  plannedMinutes: number;
  scoreA: number;
  scoreB: number;
  resultKind: 'score' | 'walkover' | 'bye' | null;
  winnerSide: 'a' | 'b' | null;
  a: Seat;
  b: Seat;
}

interface StandingRow {
  teamId: string | null;
  played: number;
  points: number;
}

interface StageRow {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
  cutTies: string[];
  groups: { id: string; standings: StandingRow[] }[];
}

interface TournamentRow {
  status: 'draft' | 'live' | 'closed';
  entrants: { teamId: string; name: string }[];
  stages: StageRow[];
  matches: MatchRow[];
}

interface ConsoleBody {
  courts: { id: string; courtNumber: number; label: string }[];
  tournament: TournamentRow | null;
  /** After the switch the console reads the award day: the mode, and whether its bracket drained. */
  mode: 'fixtures' | 'switching' | 'dumb';
  modeSwitch: { fixturesEnded: boolean } | null;
}

/** The cast, discovered from the tables as the day unfolds (group seeding is the builder's business). */
const cast = {
  teamIds: [] as string[],
  courtIds: [] as string[],
  captainNickname: '',
  walkoverWinner: '',
  walkoverLoser: '',
  cleanThird: '',
  tiedWinner: '',
  tieLoser: '',
  groupWinner: '',
};

test.describe('ADR-335 — the dress rehearsal: seven things go wrong on the day', () => {
  test.describe.configure({ mode: 'serial' });

  test('provisions six teams and two courts', async ({ request }) => {
    cast.teamIds = await provisionTeams(request);
    cast.courtIds = await provisionCourts(request);
    expect(cast.teamIds).toHaveLength(6);
    expect(cast.courtIds).toHaveLength(2);
  });

  test('starts the rehearsal day: groups at 10 minutes, a 20-minute knockout', async ({ request, page }) => {
    await startDay(request);
    const tournament = await readTournament(request);
    expect(tournament.stages.map((stage) => [stage.label, stage.status])).toEqual([
      ['Groups', 'active'],
      ['Knockout', 'pending'],
    ]);
    const knockout = tournament.matches.filter((match) => match.stageLabel === 'Knockout');
    expect(knockout.length).toBeGreaterThan(0);
    expect(knockout.every((match) => match.plannedMinutes === 20)).toBe(true);

    await openDesk(page);
    await expect(page.getByTestId('tournament-stages__stage').first()).toContainText('Groups — active');
    await page.screenshot({ path: `screenshots/dr-started-${stamp()}.png`, fullPage: true });
  });

  test('1 · side A never arrives: the desk awards the walkover', async ({ request, page }) => {
    const fixture = (await readTournament(request)).matches.find((match) => match.stageLabel === 'Groups' && match.status === 'scheduled');
    if (fixture === undefined) throw new Error('no group fixture to walk over');
    cast.walkoverWinner = fixture.b.teamId ?? '';
    cast.walkoverLoser = fixture.a.teamId ?? '';

    await openDesk(page);
    const row = await deskRow(page, 'tournament-matches__queued', fixture.code);
    await row.getByTestId('tournament-matches__walkover-b').click();
    await confirmReason(page, 'Side A never arrived.');
    await expect((await deskRow(page, 'tournament-matches__finished', fixture.code))).toContainText('walkover → B');
    expect(await readMatch(request, fixture.id)).toMatchObject({ status: 'completed', resultKind: 'walkover', winnerSide: 'b' });
    await page.screenshot({ path: `screenshots/dr-walkover-${stamp()}.png`, fullPage: true });
  });

  test('the groups are played out to the script, and the cut is genuinely tied', async ({ request, page }) => {
    await playGroupsOut(request, page);
    const groups = await readStage(request, 'Groups');
    expect(groups.cutTies.length).toBeGreaterThan(0);
    const tiedGroup = groups.groups.find((group) => !group.standings.some((row) => row.teamId === cast.walkoverWinner));
    const tied = (tiedGroup?.standings ?? []).filter((row) => row.played === 2 && row.points === 1);
    expect(tied.map((row) => row.teamId).sort()).toEqual([cast.tiedWinner, cast.tieLoser].sort());
  });

  test('2 · dead level on the cut: the desk closes the groups with the toss winner named', async ({ request, page }) => {
    await openDesk(page);
    const block = page.getByTestId('tournament-stages__stage').filter({ hasText: 'Groups — active' });
    await block.getByTestId('tournament-stages__complete').click();
    await expect(page.getByRole('dialog', { name: 'Close Groups' })).toBeVisible();
    // Four places are listed; the fourth is the tied one. The coin put cast.tieLoser through.
    await page.getByTestId('tournament-act__override').nth(3).selectOption(cast.tieLoser);
    await confirmReason(page, 'Level on points, difference and scored: the coin put them through.');

    await expect(page.getByTestId('tournament-stages__stage').filter({ hasText: 'Groups — completed' })).toBeVisible();
    const tournament = await readTournament(request);
    const seated = tournament.matches
      .filter((match) => match.stageLabel === 'Knockout' && match.status === 'scheduled')
      .flatMap((match) => [match.a.teamId, match.b.teamId]);
    expect(seated).toContain(cast.tieLoser);
    expect(seated).not.toContain(cast.tiedWinner);
    await page.screenshot({ path: `screenshots/dr-tie-on-cut-${stamp()}.png`, fullPage: true });
  });

  test('3 · a qualifier is absent: the desk reseats his semi-final seat', async ({ request, page }) => {
    const tournament = await readTournament(request);
    const semi = tournament.matches.find(
      (match) => match.stageLabel === 'Knockout' && match.status === 'scheduled' && (match.a.teamId === cast.groupWinner || match.b.teamId === cast.groupWinner),
    );
    if (semi === undefined) throw new Error('no semi-final holds the absent qualifier');
    const side = semi.a.teamId === cast.groupWinner ? 'a' : 'b';

    await openDesk(page);
    const row = await deskRow(page, 'tournament-matches__queued', semi.code);
    await row.getByTestId('tournament-matches__reseat').click();
    await expect(page.getByRole('dialog', { name: `Reseat ${semi.code}` })).toBeVisible();
    await page.getByTestId('tournament-act__reseat-side').selectOption(side);
    await page.getByTestId('tournament-act__reseat-team').selectOption(cast.cleanThird);
    await confirmReason(page, 'The qualifier is absent; the next team present takes the seat.');

    const after = await readMatch(request, semi.id);
    expect(side === 'a' ? after.a.teamId : after.b.teamId).toBe(cast.cleanThird);
    await page.screenshot({ path: `screenshots/dr-reseated-${stamp()}.png`, fullPage: true });
  });

  test('4 · the hall needs the courts back: the desk cuts the knockout from 20 to 12', async ({ request, page }) => {
    await openDesk(page);
    await typeInto(page.getByTestId('tournament-contingency__stage-minutes'), '12');
    await page.getByTestId('tournament-contingency__preview-button').click();
    await expect(page.getByTestId('tournament-contingency__preview')).toBeVisible();
    await page.getByTestId('tournament-contingency__apply').click();

    await expect
      .poll(async () => (await readTournament(request)).matches.filter((match) => match.stageLabel === 'Knockout').every((match) => match.plannedMinutes === 12))
      .toBe(true);
    await page.screenshot({ path: `screenshots/dr-retimed-${stamp()}.png`, fullPage: true });
  });

  test('5 · the marshal’s phone dies mid-semi: the desk hands the match back, and it is played', async ({ request, page }) => {
    const semi = (await readTournament(request)).matches.find((match) => match.stageLabel === 'Knockout' && match.status === 'scheduled');
    if (semi === undefined) throw new Error('no semi-final to hand back');

    await startFixture(page, request, semi.id);
    await openDesk(page);
    const liveRow = await deskRow(page, 'tournament-matches__live', semi.code);
    await liveRow.getByTestId('tournament-matches__hand-back').click();
    await confirmReason(page, 'The marshal’s phone died; the desk takes the match back.');
    await expect(await deskRow(page, 'tournament-matches__queued', semi.code)).toBeVisible();
    expect((await readMatch(request, semi.id)).status).toBe('scheduled');

    await playFixture({ page, request, matchId: semi.id, winnerScore: 1, loserScore: 0 });
    expect((await readMatch(request, semi.id)).status).toBe('completed');
    await page.screenshot({ path: `screenshots/dr-handed-back-${stamp()}.png`, fullPage: true });
  });

  test('6 · the other semi finishes level: the marshal settles it by coin toss', async ({ request, page }) => {
    const semi = (await readTournament(request)).matches.find((match) => match.stageLabel === 'Knockout' && match.status === 'scheduled');
    if (semi === undefined) throw new Error('no semi-final left to settle');
    await startFixture(page, request, semi.id);
    await setScore(page, 'a', 1);
    await setScore(page, 'b', 1);
    await expect(page.getByTestId('court__level')).toBeVisible();
    await page.getByTestId('court__tiebreak-method').selectOption('coin_toss');
    const winnerName = semi.a.teamName ?? '';
    await page.getByTestId('court__tiebreak-winner').filter({ hasText: winnerName }).click();
    await page.getByTestId('confirm-dialog__confirm').click();
    await expect(page.getByTestId('court__scoreboard')).toHaveCount(0);

    expect(await readMatch(request, semi.id)).toMatchObject({ status: 'completed', scoreA: 1, scoreB: 1, winnerSide: 'a' });
    await page.screenshot({ path: `screenshots/dr-tiebreak-${stamp()}.png`, fullPage: true });
  });

  test('7 · the extraordinary afternoon: mid-final, a court asks and the desk switches the day to awarding', async ({ request, page }) => {
    const before = await readTournament(request);
    const final = before.matches.find((match) => match.stageLabel === 'Knockout' && match.status === 'scheduled');
    if (final === undefined) throw new Error('no final to play under the switch');
    if (final.a.teamId === null || final.b.teamId === null) throw new Error('the final is not seated');
    expect(final.plannedMinutes).toBe(12);
    const nameOf = (teamId: string) => before.entrants.find((entrant) => entrant.teamId === teamId)?.name ?? '';
    const paidTeamId = cast.tieLoser; // out in the groups, on no court: it can be paid while the final runs
    if (paidTeamId === '') throw new Error('no idle team to pay');

    // The final goes on court — the one match the switch must never reroute.
    await startFixture(page, request, final.id);
    const finalCourtId = (await readMatch(request, final.id)).courtId;
    if (finalCourtId === null) throw new Error('the final never took a court');
    const askCourtId = cast.courtIds.find((id) => id !== finalCourtId) ?? cast.courtIds[0];

    // The ask, from the idle court, while the final runs (ADR-336 §3 — it never expires).
    await page.goto(`/staff/court/${askCourtId}`);
    await typeInto(page.getByTestId('mode-ask__reason'), 'The hall must close early; we cannot finish this bracket.');
    await page.getByTestId('mode-ask__submit').click();
    await expect(page.getByTestId('mode-ask__pending')).toBeVisible();
    await page.screenshot({ path: `screenshots/dr-switch-ask-${stamp()}.png`, fullPage: true });

    // The desk reviews the ask: who asked, from where — and no clock is ticking (ADR-342).
    await openDesk(page);
    await expect(page.getByTestId('mode-panel__ask-text')).toContainText(`asks from Court`);
    await expect(page.getByTestId('mode-panel__ask-text')).toContainText('The hall must close early');
    await page.getByTestId('mode-panel__ask-review').click();

    // The form opens with the ask's reason prefilled and the day's own paid rates as buttons
    // (this day pays 30/20/10, derived — never the table points, never pre-armed).
    await expect(page.getByTestId('mode-panel__reason')).toHaveValue('The hall must close early; we cannot finish this bracket.');
    await expect(page.getByTestId('mode-panel__form-age')).toContainText('Asked by');
    await expect(page.getByTestId('mode-panel__tier-points').first()).toHaveValue('30');
    await expect(page.getByTestId('mode-panel__tier-points').last()).toHaveValue('10');
    await typeInto(page.getByTestId('mode-panel__word'), 'switch');
    await page.getByTestId('mode-panel__confirm').click();

    // The one-way switch: the banner names the drain, court by court, and names no way back.
    await expect(page.getByTestId('mode-panel__banner')).toContainText('finish first');
    await expect(page.getByTestId('mode-panel__drain')).toContainText('finishing its match, then awarding');
    await expect(page.getByTestId('mode-panel__drain')).toContainText('— awarding points');
    await page.screenshot({ path: `screenshots/dr-switch-banner-${stamp()}.png`, fullPage: true });

    // The idle court flipped the moment the desk confirmed: its page is an award station now.
    await signInStaff(page, FACILITATOR);
    await page.goto(`/staff/court/${askCourtId}`);
    await expect(page.getByTestId('dumb-court__tier').first()).toBeVisible();

    // A team still on court cannot be paid, and the room is told which court holds it
    // (the refusal lands on the court's one outcome line, like every other answer).
    await page.getByTestId('dumb-court__tier').filter({ hasText: '30 pts' }).click();
    await page.getByTestId('dumb-court__team').filter({ hasText: nameOf(final.a.teamId) }).click();
    await page.getByTestId('confirm-dialog__confirm').click();
    await expect(page.getByTestId('dumb-court__outcome')).toContainText('still playing on');
    await expect(page.getByTestId('dumb-court__outcome')).toContainText('Finish or call off that match first.');

    // An idle team is paid on the spot, through the same ledger a result writes to.
    await page.getByTestId('dumb-court__team').filter({ hasText: nameOf(paidTeamId) }).click();
    await page.getByTestId('confirm-dialog__confirm').click();
    await expect(page.getByTestId('dumb-court__outcome')).toContainText(`${nameOf(paidTeamId)} is awarded 30 points!`);

    // The final finishes under its own marshal — the switch never rerouted its court.
    await page.goto(`/staff/court/${finalCourtId}`);
    await expect(page.getByTestId('court__scoreboard')).toBeVisible();
    await setScore(page, 'a', 2);
    await setScore(page, 'b', 1);
    await page.getByTestId('court__end').click();
    await page.getByTestId('confirm-dialog__confirm').click();
    await expect(page.getByTestId('court__scoreboard')).toHaveCount(0);

    // The bracket ended itself when its last court finished (ADR-336 §5): no desk act closed it.
    const console_ = await readConsole(request);
    expect(console_.mode).toBe('dumb');
    expect(console_.modeSwitch?.fixturesEnded).toBe(true);

    // The final's court is an award station now too — the drain reached its end.
    await page.goto(`/staff/court/${finalCourtId}`);
    await expect(page.getByTestId('dumb-court__tier').first()).toBeVisible();
    await page.screenshot({ path: `screenshots/dr-switch-award-${stamp()}.png`, fullPage: true });
  });

  test('the award day closes: Results keeps both halves, and the desk ends the day', async ({ request, page }) => {
    // A participant reads the day: the awards above the divider, the matches below it (ADR-336 §8).
    await signInParticipant(page, cast.captainNickname);
    await page.goto('/feed/results');
    await expect(page.getByTestId('match-feed__award-row').first()).toContainText('is awarded 30 points!');
    await expect(page.getByTestId('match-feed__switch-divider')).toHaveText('Tournament switched to points award mode');
    await expect(page.getByTestId('match-feed__row').first()).toBeVisible();
    await page.screenshot({ path: `screenshots/dr-switch-results-${stamp()}.png`, fullPage: true });

    // The desk closes the award day — a reason is owed, because the room paid awards.
    await openDesk(page);
    await page.getByTestId('tournament-scheduler__close').click();
    await confirmReason(page, 'The hall is closing; the day is done.');
    await expect(page.getByTestId('tournament-control__closed')).toBeVisible();
    expect((await readConsole(request)).tournament?.status).toBe('closed');
    await page.screenshot({ path: `screenshots/dr-closed-${stamp()}.png`, fullPage: true });
  });
});

/** Six captains and their teams, through the app's own APIs (the full-event spec's pattern). */
async function provisionTeams(request: APIRequestContext): Promise<string[]> {
  const teamIds: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const nickname = unique(`Reh${index}`);
    if (index === 0) cast.captainNickname = nickname;
    await apiSignUp(request, { nickname });
    const created = await request.post('/api/teams', { data: { teamName: unique(`Cast${index}`) } });
    expect(created.ok(), `creating team ${index}: ${await created.text()}`).toBe(true);
    const { team } = (await created.json()) as { team: { id: string } };
    teamIds.push(team.id);
    await request.post('/api/auth/signout', { data: {} });
  }
  return teamIds;
}

async function provisionCourts(request: APIRequestContext): Promise<string[]> {
  await apiSignIn(request, '/api/auth/superadmins/signin', seeded.superadmin);
  const courtIds: string[] = [];
  for (const courtNumber of [1, 2]) {
    const created = await request.post('/api/admin/tournament/courts', { data: { courtNumber, label: `Court ${courtNumber}` } });
    expect(created.ok(), `creating court ${courtNumber}: ${await created.text()}`).toBe(true);
    const body = (await created.json()) as ConsoleBody;
    const court = body.courts.find((row) => row.courtNumber === courtNumber);
    if (court === undefined) throw new Error(`court ${courtNumber} missing after creation`);
    courtIds.push(court.id);
  }
  return courtIds;
}

async function startDay(request: APIRequestContext): Promise<void> {
  await apiSignIn(request, '/api/auth/superadmins/signin', seeded.superadmin);
  const created = await request.post('/api/admin/tournament', {
    data: { name: unique('Rehearsal day'), winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds: cast.teamIds },
  });
  expect(created.ok(), `creating the draft: ${await created.text()}`).toBe(true);
  const started = await request.post('/api/admin/tournament/activate', {
    data: {
      pipeline: {
        stages: [
          { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 10, options: { groupSize: 3, advanceCount: 2 } },
          { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 20, options: {} },
        ],
      },
      matchMinutes: 10,
      changeoverMinutes: 2,
      restMinutes: 0,
    },
  });
  expect(started.ok(), `starting the day: ${await started.text()}`).toBe(true);
}

async function readConsole(request: APIRequestContext): Promise<ConsoleBody> {
  await apiSignIn(request, '/api/auth/superadmins/signin', seeded.superadmin);
  const response = await request.get('/api/admin/tournament');
  expect(response.ok(), `reading the console: ${await response.text()}`).toBe(true);
  return (await response.json()) as ConsoleBody;
}

async function readTournament(request: APIRequestContext): Promise<TournamentRow> {
  const { tournament } = await readConsole(request);
  if (tournament === null) throw new Error('no tournament on the console');
  return tournament;
}

async function readStage(request: APIRequestContext, label: string): Promise<StageRow> {
  const stage = (await readTournament(request)).stages.find((row) => row.label === label);
  if (stage === undefined) throw new Error(`no stage ${label}`);
  return stage;
}

async function readMatch(request: APIRequestContext, matchId: string): Promise<MatchRow> {
  const match = (await readTournament(request)).matches.find((row) => row.id === matchId);
  if (match === undefined) throw new Error('match missing from the console');
  return match;
}

async function openDesk(page: Page): Promise<void> {
  await signInSuperadmin(page);
  await page.goto('/admin/tournament');
  await expect(page.getByTestId('tournament-stages')).toBeVisible();
}

async function deskRow(page: Page, section: string, code: string) {
  // The code is the row's first cell, so the match is anchored at the start of the row's text:
  // the seat "Winner of KO1-1" on a later row would otherwise answer for the code too. Cells
  // concatenate with no separators in textContent, hence the "not followed by a digit" guard.
  const row = page.getByTestId(section).getByTestId('tournament-matches__row').filter({ hasText: new RegExp(`^${code}(?!\\d)`) });
  await expect(row).toBeVisible();
  return row;
}

async function confirmReason(page: Page, reason: string): Promise<void> {
  await typeInto(page.getByTestId('reason-dialog__reason'), reason);
  await page.getByTestId('reason-dialog__confirm').click();
  await expect(page.getByTestId('reason-dialog__reason')).toHaveCount(0);
}

/** Starts one scheduled fixture on the court it was planned for, through the marshal's pickers. */
async function startFixture(page: Page, request: APIRequestContext, matchId: string): Promise<MatchRow> {
  const fixture = await readMatch(request, matchId);
  if (fixture.a.teamId === null || fixture.b.teamId === null) throw new Error('fixture is not seated');
  await signInStaff(page, FACILITATOR);
  await page.goto(`/staff/court/${fixture.courtId ?? cast.courtIds[0]}`);
  await page.getByTestId('court__team-a').selectOption(fixture.a.teamId);
  await page.getByTestId('court__team-b').selectOption(fixture.b.teamId);
  await expect(page.getByTestId('court__schedule-note')).toContainText('On the schedule');
  await page.getByTestId('court__start').click();
  await expect(page.getByTestId('court__scoreboard')).toBeVisible();
  return fixture;
}

async function setScore(page: Page, side: 'a' | 'b', target: number): Promise<void> {
  let current = Number((await page.getByTestId(`court__score-${side}`).textContent()) ?? '0');
  while (current < target) {
    await page.getByTestId(`court__step-${side}-${current + 1}`).click();
    current += 1;
    await expect(page.getByTestId(`court__score-${side}`)).toHaveText(String(current));
  }
}

/** Plays a fixture to a win for the side the script names (side A unless the winner is B). */
async function playFixture(input: {
  page: Page;
  request: APIRequestContext;
  matchId: string;
  winnerScore: number;
  loserScore: number;
  winnerTeamId?: string;
}): Promise<void> {
  const fixture = await startFixture(input.page, input.request, input.matchId);
  const winnerSide: 'a' | 'b' = input.winnerTeamId !== undefined && fixture.b.teamId === input.winnerTeamId ? 'b' : 'a';
  const loserSide = winnerSide === 'a' ? 'b' : 'a';
  await setScore(input.page, winnerSide, input.winnerScore);
  await setScore(input.page, loserSide, input.loserScore);
  await input.page.getByTestId('court__end').click();
  await input.page.getByTestId('confirm-dialog__confirm').click();
  await expect(input.page.getByTestId('court__scoreboard')).toHaveCount(0);
}

async function playCleanGroup(request: APIRequestContext, page: Page): Promise<void> {
  // The walkover group finishes clean: winner, then the no-show side, then the third team.
  const cleanWinnerGame = (await readTournament(request)).matches.find(
    (match) =>
      match.stageLabel === 'Groups' &&
      match.status === 'scheduled' &&
      [match.a.teamId, match.b.teamId].includes(cast.walkoverWinner) &&
      ![match.a.teamId, match.b.teamId].includes(cast.walkoverLoser),
  );
  if (cleanWinnerGame === undefined) throw new Error('no clean-group game for the walkover winner');
  cast.cleanThird = cleanWinnerGame.a.teamId === cast.walkoverWinner ? (cleanWinnerGame.b.teamId ?? '') : (cleanWinnerGame.a.teamId ?? '');
  await playFixture({ page, request, matchId: cleanWinnerGame.id, winnerScore: 1, loserScore: 0, winnerTeamId: cast.walkoverWinner });

  const cleanLast = (await readTournament(request)).matches.find(
    (match) => match.stageLabel === 'Groups' && match.status === 'scheduled' && [match.a.teamId, match.b.teamId].includes(cast.walkoverLoser),
  );
  if (cleanLast === undefined) throw new Error('no clean-group game for the walkover loser');
  await playFixture({ page, request, matchId: cleanLast.id, winnerScore: 1, loserScore: 0, winnerTeamId: cast.walkoverLoser });
}

async function playTiedGroup(request: APIRequestContext, page: Page): Promise<void> {
  // The other group: its first-listed team beats both others identically; those two draw.
  const groups = await readStage(request, 'Groups');
  const tiedGroup = groups.groups.find((group) => !group.standings.some((row) => row.teamId === cast.walkoverWinner));
  const tiedTeams = (tiedGroup?.standings ?? []).map((row) => row.teamId ?? '');
  [cast.groupWinner, cast.tiedWinner, cast.tieLoser] = [tiedTeams[0] ?? '', tiedTeams[1] ?? '', tiedTeams[2] ?? ''];
  for (const opponent of [cast.tiedWinner, cast.tieLoser]) {
    const game = (await readTournament(request)).matches.find(
      (match) =>
        match.stageLabel === 'Groups' &&
        match.status === 'scheduled' &&
        [match.a.teamId, match.b.teamId].includes(cast.groupWinner) &&
        [match.a.teamId, match.b.teamId].includes(opponent),
    );
    if (game === undefined) throw new Error('no tied-group game for the group winner');
    await playFixture({ page, request, matchId: game.id, winnerScore: 1, loserScore: 0, winnerTeamId: cast.groupWinner });
  }

  const drawn = (await readTournament(request)).matches.find((match) => match.stageLabel === 'Groups' && match.status === 'scheduled');
  if (drawn === undefined) throw new Error('no drawn game left in the groups');
  await startFixture(page, request, drawn.id);
  await setScore(page, 'a', 1);
  await setScore(page, 'b', 1);
  await page.getByTestId('court__draw').click();
  await page.getByTestId('confirm-dialog__confirm').click();
  await expect(page.getByTestId('court__scoreboard')).toHaveCount(0);
}

async function playGroupsOut(request: APIRequestContext, page: Page): Promise<void> {
  await playCleanGroup(request, page);
  await playTiedGroup(request, page);
}
