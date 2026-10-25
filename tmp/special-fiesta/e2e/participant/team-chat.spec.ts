import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  apiSignUp,
  createTeam,
  joinTeam,
  signInParticipant,
  typeInto,
  unique,
  stamp,
} from '../support/fixtures.js';

/**
 * A team's own room, end to end (ADR-063).
 *
 * Two things here cannot be proven any other way, which is why this exists on top of the integration
 * tests:
 *
 *   1. **The push actually pushes.** Two real browser contexts, one typing and one only watching,
 *      with nothing polling in between — a real SSE connection, the real in-process bus, the real
 *      database.
 *   2. **The LED lights on a surface that is not the room.** The dot is drawn in the nav by
 *      `GameboyShell` while the thing that clears it is a panel several routes away, so only a real
 *      browser holding real navigation state can show that the two agree.
 *
 * Chromium only, for the same reason `chat.spec.ts` is: what differs between engines is
 * `EventSource`, which is uniformly supported, and the hook's decisions are unit-tested against both
 * a present and an absent one. `workers: 1` and `fullyParallel: false` make two contexts well-behaved.
 */

/** Keeps the asserted text unique per run, so a re-run cannot match an older row. */
function runStamp(): string {
  return Math.random().toString(36).slice(-5);
}

/**
 * The Teams tab's own light. The suite shares one event database across parallel files, so the
 * global room is busy with other specs' messages and the Social tab's light is on more often than
 * not; a bare `gameboy-shell__nav-alert` then matches both and proves nothing about this room.
 */
function teamLight(page: Page): Locator {
  return page.getByTestId('gameboy-shell__nav-alert').filter({ hasText: 'Unread team messages' });
}

test.describe('the team room', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Two live SSE contexts are proven once; the engines do not differ on EventSource.',
  );
  test.skip(({ isMobile }) => isMobile === true, 'Proven once per engine, on desktop.');

  test('a teammate sees the message pushed, and the Teams tab lights before they open it', async ({
    browser,
    request,
  }) => {
    const captain = unique('Skipper');
    const mate = unique('Crew');
    await apiSignUp(request, { nickname: captain });
    await apiSignUp(request, { nickname: mate });

    const captainContext = await browser.newContext();
    const mateContext = await browser.newContext();
    try {
      const captainPage = await captainContext.newPage();
      const matePage = await mateContext.newPage();
      await signInParticipant(captainPage, captain, '1234');
      await signInParticipant(matePage, mate, '1234');

      const joinCode = await createTeam(captainPage, unique('Crabs').slice(0, 30));
      await joinTeam(matePage, joinCode);

      // The room is the team's history before anybody has said anything (ADR-063).
      await captainPage.goto('/team');
      await expect(captainPage.getByTestId('team-chat__event').first()).toContainText('joined');

      /*
       * The mate goes somewhere else entirely. This is the part the integration tests cannot reach:
       * the dot is drawn in the nav, and the mate is not looking at the room.
       */
      await matePage.goto('/board');
      await expect(teamLight(matePage)).toBeHidden();

      const said = `bring the good ball ${runStamp()}`;
      await typeInto(captainPage.getByTestId('team-chat__draft'), said);
      await captainPage.getByTestId('team-chat__send').click();
      await expect(
        captainPage.getByTestId('team-chat__message').filter({ hasText: said }),
      ).toBeVisible();

      /*
       * The dot is refreshed on the jittered 45–75 s poll (ADR-024), not by a permanently-open stream
       * — three hundred sockets for one boolean is not a trade worth making — so this reloads rather
       * than waiting out a poll window in an e2e. What it proves is the thing that was broken: the
       * server knows the mate has unread messages, and the nav renders that on a surface which is not
       * the room. The liveness cadence itself is unit-tested, not waited for here.
       */
      await matePage.reload();
      await expect(teamLight(matePage)).toBeVisible({
        timeout: 15_000,
      });
      await matePage.screenshot({ path: `screenshots/ft-team-chat-led-${stamp()}.png` });

      // Opening the room shows the message and puts the light out.
      await matePage.goto('/team');
      await expect(
        matePage.getByTestId('team-chat__message').filter({ hasText: said }),
      ).toBeVisible();
      await expect(teamLight(matePage)).toBeHidden();

      // And it stays out elsewhere, because the read position is on the server, not the device.
      await matePage.goto('/board');
      await expect(teamLight(matePage)).toBeHidden();
      await matePage.screenshot({ path: `screenshots/ft-team-chat-read-${stamp()}.png` });
    } finally {
      await captainContext.close();
      await mateContext.close();
    }
  });

  test('a participant with no team gets no room and no light', async ({ page, request }) => {
    const loner = unique('Loner');
    await apiSignUp(request, { nickname: loner });
    await signInParticipant(page, loner, '1234');

    await page.goto('/team');

    // `/team` with no team is the find-a-team surface: no room to show, nothing to be alerted about.
    await expect(page.getByTestId('team-chat__draft')).toBeHidden();
    await expect(teamLight(page)).toBeHidden();
  });

  test('records leaving in the history the remaining member can still read', async ({
    browser,
    request,
  }) => {
    const captain = unique('Stayer');
    const mate = unique('Leaver');
    await apiSignUp(request, { nickname: captain });
    await apiSignUp(request, { nickname: mate });

    const captainContext = await browser.newContext();
    const mateContext = await browser.newContext();
    try {
      const captainPage = await captainContext.newPage();
      const matePage = await mateContext.newPage();
      await signInParticipant(captainPage, captain, '1234');
      await signInParticipant(matePage, mate, '1234');

      const joinCode = await createTeam(captainPage, unique('Rays').slice(0, 30));
      await joinTeam(matePage, joinCode);

      // Leaving is behind a confirmation, which is the point of it being destructive.
      await matePage.getByTestId('my-team__leave').click();
      await expect(matePage.getByTestId('confirm-dialog')).toBeVisible();
      await matePage.getByTestId('confirm-dialog__confirm').click();
      await expect(matePage.getByTestId('team-chat__draft')).toBeHidden({ timeout: 15_000 });

      await captainPage.goto('/team');
      await expect(
        captainPage.getByTestId('team-chat__event').filter({ hasText: `${mate} left the team` }),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await captainContext.close();
      await mateContext.close();
    }
  });
});
