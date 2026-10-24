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
 * Team chat — concurrent two-context LED tests (ADR-063).
 *
 * The existing team-chat.spec.ts already proves push delivery and LED/clear for the captain→mate
 * direction. This suite extends the contract to the mate→captain direction and explicitly asserts
 * the DOM-removal of the dot as the proof of "cleared" (not a visual guess — `toBeHidden()`
 * confirms the `AlertLed` component returned null).
 *
 * Chromium only; workers: 1 and fullyParallel: false make two contexts well-behaved.
 */

function runStamp(): string {
  return Math.random().toString(36).slice(-5);
}

/** The Teams tab's alert dot — filter by its visually-hidden label to avoid the Social dot. */
function teamLight(page: Page): Locator {
  return page.getByTestId('gameboy-shell__nav-alert').filter({ hasText: 'Unread team messages' });
}

test.describe('team chat — concurrent sessions', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Two live SSE contexts are proven once; the engines do not differ on EventSource.',
  );
  test.skip(({ isMobile }) => isMobile === true, 'Proven once per engine, on desktop.');

  test(
    'captain sends, mate (off the room) sees the LED light, opens room, LED clears',
    async ({ browser, request }) => {
      const captain = unique('CapA');
      const mate = unique('MateA');
      await apiSignUp(request, { nickname: captain });
      await apiSignUp(request, { nickname: mate });

      const captainContext = await browser.newContext();
      const mateContext = await browser.newContext();
      try {
        const captainPage = await captainContext.newPage();
        const matePage = await mateContext.newPage();

        await signInParticipant(captainPage, captain, '1234');
        await signInParticipant(matePage, mate, '1234');

        const joinCode = await createTeam(captainPage, unique('Turtles').slice(0, 30));
        await joinTeam(matePage, joinCode);

        // Mate goes to the leaderboard — NOT the team room.
        await matePage.goto('/board');
        await expect(teamLight(matePage)).toBeHidden();

        // Captain opens team room and sends.
        await captainPage.goto('/team');
        await expect(captainPage.getByTestId('team-chat__draft')).toBeVisible();
        const said = `captain sends ${runStamp()}`;
        await typeInto(captainPage.getByTestId('team-chat__draft'), said);
        await captainPage.getByTestId('team-chat__send').click();
        await expect(
          captainPage.getByTestId('team-chat__message').filter({ hasText: said }),
        ).toBeVisible();

        // Mate's LED lights after reload (server watermark; reload instead of waiting 45–75 s poll).
        await matePage.reload();
        await expect(teamLight(matePage)).toBeVisible({ timeout: 15_000 });
        await matePage.screenshot({ path: `screenshots/ft-team-chat-concurrent-led-${stamp()}.png` });

        // Mate opens the team room — message is there and LED element is removed from DOM.
        await matePage.goto('/team');
        await expect(
          matePage.getByTestId('team-chat__message').filter({ hasText: said }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(teamLight(matePage)).toBeHidden();
        await matePage.screenshot({ path: `screenshots/ft-team-chat-concurrent-cleared-${stamp()}.png` });

        // Leaving the room and returning: dot stays off — mark is server-side.
        await matePage.goto('/board');
        await expect(teamLight(matePage)).toBeHidden();
      } finally {
        await captainContext.close();
        await mateContext.close();
      }
    },
  );

  test(
    'reverse direction: mate sends, captain (off the room) sees the LED, opens room, LED clears',
    async ({ browser, request }) => {
      const captain = unique('CapB');
      const mate = unique('MateB');
      await apiSignUp(request, { nickname: captain });
      await apiSignUp(request, { nickname: mate });

      const captainContext = await browser.newContext();
      const mateContext = await browser.newContext();
      try {
        const captainPage = await captainContext.newPage();
        const matePage = await mateContext.newPage();

        await signInParticipant(captainPage, captain, '1234');
        await signInParticipant(matePage, mate, '1234');

        const joinCode = await createTeam(captainPage, unique('Sharks').slice(0, 30));
        await joinTeam(matePage, joinCode);

        // Captain goes to QR home — NOT the team room.
        await captainPage.goto('/home');
        await expect(teamLight(captainPage)).toBeHidden();

        // Mate opens team room and sends.
        await matePage.goto('/team');
        await expect(matePage.getByTestId('team-chat__draft')).toBeVisible();
        const said = `mate replies ${runStamp()}`;
        await typeInto(matePage.getByTestId('team-chat__draft'), said);
        await matePage.getByTestId('team-chat__send').click();
        await expect(
          matePage.getByTestId('team-chat__message').filter({ hasText: said }),
        ).toBeVisible();

        // Captain's LED lights after reload.
        await captainPage.reload();
        await expect(teamLight(captainPage)).toBeVisible({ timeout: 15_000 });

        // Captain opens the team room — message visible, LED removed from DOM.
        await captainPage.goto('/team');
        await expect(
          captainPage.getByTestId('team-chat__message').filter({ hasText: said }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(teamLight(captainPage)).toBeHidden();
        await captainPage.screenshot({
          path: `screenshots/ft-team-chat-concurrent-reverse-${stamp()}.png`,
        });
      } finally {
        await captainContext.close();
        await mateContext.close();
      }
    },
  );
});
