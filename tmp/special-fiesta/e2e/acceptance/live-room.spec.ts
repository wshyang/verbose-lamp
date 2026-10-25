import { expect, test } from '@playwright/test';
import { Cast, rendezvous, together } from '../support/cast.js';
import {
  apiSignIn,
  clearAnnouncements,
  createTeam,
  joinTeam,
  seeded,
  stamp,
  typeInto,
  unique,
} from '../support/fixtures.js';

/**
 * ADR-347 — the room at work: four browsers, one live minute.
 *
 * Every multi-context spec before this one (chat-concurrent, team-chat-concurrent,
 * team-chat-typing, announcements) proves a relay: one browser acts, then another is checked.
 * This one proves the room — four roles in four Chromium contexts, alive at the same time,
 * with assertions made on one screen WHILE another screen's action is still in flight:
 *
 *   1. the cast assembles — four sign-ins that overlap, not four sign-ins in a row;
 *   2. a typing indicator is seen on the captain's screen while the mate's keystrokes are
 *      still falling (the assertion and the action genuinely overlap);
 *   3. a burst: both send from one rendezvous, and both messages land on both screens —
 *      same-tick starts, order-free convergence;
 *   4. a station stamp crosses three roles — the desk provisions, the marshal scans the
 *      captain's number at a real station page, and the captain's passport grows the chop,
 *      while the mate's room never closes;
 *   5. the desk announces over the room while the participants are still in it, and the toast
 *      arrives on a reload (the alerts poll is 45–75 s, ADR-024 — a fresh mount fetches
 *      immediately, which is why the reload is the pattern rather than the wait).
 *
 * Chromium only, desktop only, for the reasons team-chat-typing gives: what differs between
 * engines is EventSource, uniformly supported, and several live SSE contexts in one worker are
 * what `fullyParallel: false` plus one file make well-behaved. Four contexts is roughly four
 * times a browser's memory — the honest cost of a room, and the reason this stays one file
 * with five beats rather than five files.
 */

/** The seeded station tier — the same one passport-stamps.spec.ts arms. */
const STATION_TIER = 'Award';
const STATION_POINTS = 5;

let cast: Cast;

/** The cast persists across the serial beats and is closed once, in `afterAll` — videos land then. */
test.afterAll(async () => {
  await cast?.close();
});

test.describe('the room at work — four browsers, one live minute', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Four live SSE contexts are proven once; the engines do not differ on EventSource.',
  );
  test.skip(({ isMobile }) => isMobile === true, 'Proven once per engine, on desktop.');

  test('the cast assembles: four roles, signed in at once', async ({ browser, request }) => {
    test.setTimeout(90_000);
    cast = await Cast.open(browser, [
      { as: 'participant', name: 'cap', request, nickname: unique('Cap') },
      { as: 'participant', name: 'mate', request, nickname: unique('Mate') },
      { as: 'facilitator', name: 'marshal' },
      { as: 'superadmin', name: 'desk' },
    ]);
    // Sign-in waits for the landed URL, so four members in the map IS the assertion that four
    // overlapping sessions each hold a cookie of their own. The room they will talk in is
    // founded by the captain and joined by the mate (ADR-063); both are left IN the room.
    const joinCode = await createTeam(cast.page('cap'), unique('Room').slice(0, 30));
    await joinTeam(cast.page('mate'), joinCode);
    await expect(cast.page('cap').getByTestId('team-chat__draft')).toBeVisible();
    await expect(cast.page('mate').getByTestId('team-chat__draft')).toBeVisible();
  });

  test('typing is seen while it is still happening — an assertion made mid-action', async () => {
    test.setTimeout(60_000);
    const cap = cast.page('cap');
    const mate = cast.page('mate');

    /*
     * The mate types like a person, slowly — `pressSequentially` with a delay, NOT `typeInto`
     * (which lands a whole string at once and would finish before the line could ever appear).
     * The promise is not awaited: the assertion below runs while the keystrokes are still
     * falling, and `stillTyping` is what proves the overlap rather than a lucky order. The
     * first ping leaves with the first keystroke and the throttle is 3 s (ADR-146), so ~10 s
     * of real keystrokes leaves the captain's line several seconds of margin to appear
     * mid-action even on a slow machine.
     */
    let stillTyping = true;
    const mateTypes = (async () => {
      await mate
        .getByTestId('team-chat__draft')
        .pressSequentially('nearly there, one more good point before the desk calls us over ', { delay: 150 });
      stillTyping = false;
    })();
    await expect(cap.getByTestId('team-chat__typing')).toBeVisible({ timeout: 15_000 });
    expect(stillTyping, 'the typing line appeared only after the typing had finished').toBe(false);
    await cap.screenshot({ path: `screenshots/ft-live-room-typing-${stamp()}.png` });
    await mateTypes;

    // And the mirror: the captain types, the mate's screen says so — both directions, because
    // a typing indicator that only works one way is a relay wearing a room's clothes.
    let capStillTyping = true;
    const capTypes = (async () => {
      await cap
        .getByTestId('team-chat__draft')
        .pressSequentially('checking the board next, give us two minutes and the point ', { delay: 150 });
      capStillTyping = false;
    })();
    await expect(mate.getByTestId('team-chat__typing')).toBeVisible({ timeout: 15_000 });
    expect(capStillTyping, 'the typing line appeared only after the typing had finished').toBe(false);
    await capTypes;
  });

  test('a burst sent together lands on both screens', async () => {
    test.setTimeout(60_000);
    const cap = cast.page('cap');
    const mate = cast.page('mate');
    const fromCap = `from the captain ${unique('beat')}`;
    const fromMate = `from the mate ${unique('beat')}`;

    // Both drafts are filled first; the SENDS are the burst. The rendezvous lines both roles
    // up at the same gate so the two clicks start in the same tick, not merely unsequenced.
    await together(
      () => typeInto(cap.getByTestId('team-chat__draft'), fromCap),
      () => typeInto(mate.getByTestId('team-chat__draft'), fromMate),
    );
    const gate = rendezvous(2);
    await together(
      async () => {
        gate.arrive();
        await gate.wait();
        await cap.getByTestId('team-chat__send').click();
      },
      async () => {
        gate.arrive();
        await gate.wait();
        await mate.getByTestId('team-chat__send').click();
      },
    );

    // Order-free convergence: each message reaches each screen over its own SSE stream, and
    // asserting each of the four independently is what "the room heard both" means.
    for (const page of [cap, mate]) {
      await expect(page.getByTestId('team-chat__message').filter({ hasText: fromCap })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId('team-chat__message').filter({ hasText: fromMate })).toBeVisible({
        timeout: 15_000,
      });
    }
    await cap.screenshot({ path: `screenshots/ft-live-room-burst-${stamp()}.png` });
  });

  test('the marshal stamps the captain at a station — three roles, one act', async ({ request }) => {
    test.setTimeout(90_000);
    const marshal = cast.page('marshal');
    const cap = cast.page('cap');
    const mate = cast.page('mate');
    const captainName = cast.member('cap').nickname ?? '';

    // The desk provisions the station through the app's own API (AGENTS-testing.md §6) — the
    // same station passport-stamps.spec.ts makes — signed in as the desk, because the
    // admin routes do not answer a bare request context.
    await apiSignIn(request, '/api/auth/superadmins/signin', seeded.superadmin);
    const stationName = unique('Passport Dash');
    const created = await request.post('/api/admin/activities', {
      data: { activityName: stationName, awardTiers: [{ label: STATION_TIER, points: STATION_POINTS }] },
    });
    expect(created.ok(), `creating the station: ${await created.text()}`).toBe(true);
    const { activity } = (await created.json()) as { activity: { id: string } };

    // The captain's badge carries the four digits the marshal will type (ADR-088: the number
    // names a person at the station, so nobody types a nickname under glare).
    await cap.goto('/home');
    const scanNumber = (await cap.getByTestId('qr-home__scan-number').innerText()).trim();
    expect(scanNumber).toMatch(/^\d{4}$/);

    // The marshal picks the station off the staff home and opens the round — in the browser,
    // through the same page a marshal would actually hold.
    await marshal.goto('/staff');
    await marshal.getByTestId('staff-home__station').filter({ hasText: stationName }).click();
    await expect(marshal).toHaveURL(new RegExp(`/staff/activity/${activity.id}$`));
    await marshal.getByTestId('fringe__open-round').click();
    await expect(marshal.getByTestId('fringe__number')).toBeEnabled({ timeout: 15_000 });

    // The fourth digit IS the submit (ADR-085); the confirm dialog leads with the NICKNAME —
    // the fact a marshal checks against the human in front of them (ADR-088) — so assert it.
    await typeInto(marshal.getByTestId('fringe__number'), scanNumber);
    const confirmTitle = marshal.getByTestId('confirm-dialog__title');
    await expect(confirmTitle).toBeVisible({ timeout: 15_000 });
    await expect(confirmTitle).toContainText(captainName);
    await marshal.getByTestId('confirm-dialog__confirm').click();

    // The marshal's own screen records the act: the log row names the captain and the points.
    await expect(marshal.getByTestId('fringe__log-row').filter({ hasText: captainName })).toBeVisible({
      timeout: 15_000,
    });
    await marshal.screenshot({ path: `screenshots/ft-live-room-station-${stamp()}.png` });

    // The captain's passport grows the chop on that station — a navigation, not a reload: the
    // passport is read on mount, which AGENTS-testing.md keeps the e2e honest about.
    await cap.goto('/me/scans');
    await cap.getByTestId('scan-history-tabs__link').nth(0).click();
    await expect(cap).toHaveURL(/\/me\/scans\/passport$/);
    const row = cap.getByTestId('passport__station').filter({ hasText: stationName });
    await expect(row).toHaveCount(1);
    const chop = row.getByTestId('passport-chop__mark');
    await expect(chop).toBeVisible();
    await expect(chop).toHaveAccessibleName('Completed');
    await cap.screenshot({ path: `screenshots/ft-live-room-passport-${stamp()}.png` });

    // The room survived the detour: the mate never left it, and a message sent now is on the
    // captain's screen the moment they walk back in — the interleave keeps its promise.
    const stillHere = `still here ${unique('beat')}`;
    await typeInto(mate.getByTestId('team-chat__draft'), stillHere);
    await mate.getByTestId('team-chat__send').click();
    await cap.goto('/teams');
    await expect(cap.getByTestId('team-chat__message').filter({ hasText: stillHere })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('the desk announces over the room, and the toast arrives on a reload', async ({ request }) => {
    test.setTimeout(90_000);
    const desk = cast.page('desk');
    const cap = cast.page('cap');

    // The oldest live row is the toast that renders, so clear the boards first (the helper's
    // doc comment in fixtures.ts says why an unchecked 404 is the expected reply).
    await clearAnnouncements(request);
    const body = `Results at the desk in five minutes ${unique('note')}`;

    // The desk announces through the real console while the participants are still in the room.
    await desk.goto('/admin/announce');
    await desk.getByTestId('announce__body').fill(body);
    await desk.getByTestId('announce__send').click();
    await expect(desk.getByTestId('announce__row').filter({ hasText: body })).toBeVisible({ timeout: 20_000 });

    // The toast is a fresh mount's fetch (ADR-024's jittered poll is 45–75 s), so the reload
    // is the pattern — the same one announcements.spec.ts uses, for the same reason.
    await cap.reload();
    await expect(cap.getByTestId('announcement-toast')).toBeVisible({ timeout: 20_000 });
    await expect(cap.getByTestId('announcement-toast__body')).toHaveText(body);
    await cap.screenshot({ path: `screenshots/ft-live-room-toast-${stamp()}.png` });
  });
});
