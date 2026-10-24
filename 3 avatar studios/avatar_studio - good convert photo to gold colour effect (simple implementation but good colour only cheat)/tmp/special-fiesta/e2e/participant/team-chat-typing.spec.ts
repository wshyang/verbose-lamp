import { expect, test, type Page } from '@playwright/test';
import { TEAM_CHAT_TYPING_PING_MS, TEAM_CHAT_TYPING_TTL_MS } from '@psd/contracts';
import {
  apiSignUp,
  createTeam,
  joinTeam,
  signInParticipant,
  stamp,
  typeInto,
  unique,
} from '../support/fixtures.js';

/**
 * Who is typing in the team room, end to end (ADR-146).
 *
 * Two real browser contexts, both with the room open, nothing mocked in between: a real
 * composer producing real keystrokes, a real throttled POST, the real in-process bus, a real
 * `EventSource`, and a real line of text appearing on somebody else's screen.
 *
 * Four things here are **only** provable in a browser, and each is a bug the unit tests
 * cannot see:
 *
 *   1. **The ping leaves the page at all.** There is no keystroke handler anywhere in the
 *      component — `useTypingSignal` watches composer state — so the one thing an integration
 *      test cannot confirm is that real typing moves that state and produces a request.
 *   2. **The throttle holds against a human hand.** Twenty characters must not be twenty
 *      requests. Fake timers prove the arithmetic; only a keyboard proves the wiring.
 *   3. **The TTL expires on a wall clock.** Every unit test of this advances a fake clock.
 *      Here nobody advances anything: the name has to go away on its own, in real seconds,
 *      with no \"stopped typing\" message to help it — which is the decision ADR-146 made and
 *      the one most likely to be quietly undone.
 *   4. **The name goes the instant the message lands**, not when the TTL happens to run out.
 *      The assertion below is given a deliberately short timeout, and that short timeout *is*
 *      the test: pass it generously and a broken `clearFor` would still go green six seconds
 *      later.
 *
 * Chromium only and desktop only, for the reasons `team-chat.spec.ts` gives: what differs
 * between engines is `EventSource`, which is uniformly supported, and `workers: 1` plus
 * `fullyParallel: false` are what make several live contexts well-behaved.
 */

const typingLine = (page: Page) => page.getByTestId('team-chat__typing');

/**
 * Types slowly enough to look like a person and to span more than one ping window, and
 * counts the pings that actually leave the browser while doing it.
 */
async function typeAndCountPings(page: Page, text: string): Promise<number> {
  let pings = 0;
  // One reference, held: `page.off` with a freshly-written arrow would remove nothing and
  // leave the counter attached to the page for the rest of the test.
  const count = (item: { url: () => string }) => {
    if (item.url().endsWith('/api/team-chat/typing')) pings += 1;
  };
  page.on('request', count);
  try {
    await page.getByTestId('team-chat__draft').pressSequentially(text, { delay: 120 });
  } finally {
    page.off('request', count);
  }
  return pings;
}

test.describe('who is typing', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Live SSE across contexts is proven once; the engines do not differ on EventSource.',
  );
  test.skip(({ isMobile }) => isMobile === true, 'Proven once per engine, on desktop.');

  test('a teammate sees the name appear, and sees it go the moment the message lands', async ({
    browser,
    request,
  }) => {
    const captain = unique('Lookout');
    const mate = unique('Typist');
    await apiSignUp(request, { nickname: captain });
    await apiSignUp(request, { nickname: mate });

    const captainContext = await browser.newContext();
    const mateContext = await browser.newContext();
    try {
      const captainPage = await captainContext.newPage();
      const matePage = await mateContext.newPage();
      await signInParticipant(captainPage, captain, '1234');
      await signInParticipant(matePage, mate, '1234');

      const joinCode = await createTeam(captainPage, unique('Terns').slice(0, 30));
      await joinTeam(matePage, joinCode);

      // Both are looking at the room. That is the only audience this feature has.
      await captainPage.goto('/team');
      await matePage.goto('/team');
      await expect(captainPage.getByTestId('team-chat__draft')).toBeVisible({ timeout: 15_000 });

      // The line is always on the page and empty until somebody types — the reserved height
      // is what stops the composer jumping under a thumb.
      await expect(typingLine(captainPage)).toHaveText('');

      const said = 'meet at the net in five';
      const pings = await typeAndCountPings(matePage, said);

      await expect(typingLine(captainPage)).toHaveText(`${mate} is typing…`, { timeout: 10_000 });
      await captainPage.screenshot({ path: `screenshots/ft-typing-${stamp()}.png` });

      /*
       * Twenty-three characters typed over about three seconds. One ping is correct, two is
       * the boundary of the window; anything approaching one-per-keystroke is the throttle
       * having been lost, which is the regression that would quietly turn a cosmetic hint
       * into three hundred phones posting per keypress.
       */
      expect(pings).toBeGreaterThan(0);
      expect(pings).toBeLessThanOrEqual(2);

      // You never watch yourself type, however loudly you are typing.
      await expect(typingLine(matePage)).toHaveText('');

      await matePage.getByTestId('team-chat__send').click();
      await expect(
        captainPage.getByTestId('team-chat__message').filter({ hasText: said }),
      ).toBeVisible({ timeout: 15_000 });

      /*
       * The short timeout is the assertion. The last ping was at most a second or so ago, so
       * the TTL has seconds left to run: if this clears, it cleared because the message
       * arrived and not because the name timed out.
       */
      await expect(typingLine(captainPage)).toHaveText('', { timeout: 2_000 });
    } finally {
      await captainContext.close();
      await mateContext.close();
    }
  });

  test('the name expires on its own, with nothing sent to retract it', async ({
    browser,
    request,
  }) => {
    const captain = unique('Idler');
    const mate = unique('Quitter');
    await apiSignUp(request, { nickname: captain });
    await apiSignUp(request, { nickname: mate });

    const captainContext = await browser.newContext();
    const mateContext = await browser.newContext();
    try {
      const captainPage = await captainContext.newPage();
      const matePage = await mateContext.newPage();
      await signInParticipant(captainPage, captain, '1234');
      await signInParticipant(matePage, mate, '1234');

      const joinCode = await createTeam(captainPage, unique('Gulls').slice(0, 30));
      await joinTeam(matePage, joinCode);
      await captainPage.goto('/team');
      await matePage.goto('/team');
      await expect(captainPage.getByTestId('team-chat__draft')).toBeVisible({ timeout: 15_000 });

      await typeInto(matePage.getByTestId('team-chat__draft'), 'hang on');
      await expect(typingLine(captainPage)).toHaveText(`${mate} is typing…`, { timeout: 10_000 });

      /*
       * And now the mate does nothing at all — no send, no clearing the box, and in the real
       * failure this stands in for, no phone either: the screen has locked, iOS has
       * backgrounded the tab (ADR-041), or they have walked behind the marquee. Nothing will
       * ever arrive to retract the name, which is precisely why the receiver forgets it.
       *
       * The margin is the sweep interval plus slack. A tighter window would be measuring the
       * test machine rather than the TTL.
       */
      await expect(typingLine(captainPage)).toHaveText('', {
        timeout: TEAM_CHAT_TYPING_TTL_MS + 4_000,
      });

      // Forgetting is silent: no \"stopped typing\", no trace in the history of the room.
      await expect(captainPage.getByTestId('team-chat__event').filter({ hasText: 'typing' })).toHaveCount(
        0,
      );
    } finally {
      await captainContext.close();
      await mateContext.close();
    }
  });

  /**
   * Three contexts, because two names is the only form that needs three people and it is the
   * form `TEAM_CHAT_TYPING_NAMES_MAX` was made a constant for. The count form past the
   * threshold is unit-tested on `typingLine`; what is worth a browser is that two independent
   * streams accumulate into one line rather than overwriting each other.
   */
  test('two typists are both named in one line', async ({ browser, request }) => {
    const captain = unique('Reader');
    const first = unique('Ann');
    const second = unique('Bo');
    for (const nickname of [captain, first, second]) {
      await apiSignUp(request, { nickname });
    }

    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
    try {
      const [captainPage, firstPage, secondPage] = await Promise.all(
        contexts.map((context) => context.newPage()),
      );
      if (!captainPage || !firstPage || !secondPage) throw new Error('No pages');
      await signInParticipant(captainPage, captain, '1234');
      await signInParticipant(firstPage, first, '1234');
      await signInParticipant(secondPage, second, '1234');

      const joinCode = await createTeam(captainPage, unique('Kites').slice(0, 30));
      await joinTeam(firstPage, joinCode);
      await joinTeam(secondPage, joinCode);
      await captainPage.goto('/team');
      await expect(captainPage.getByTestId('team-chat__draft')).toBeVisible({ timeout: 15_000 });

      await firstPage.goto('/team');
      await secondPage.goto('/team');
      await typeInto(firstPage.getByTestId('team-chat__draft'), 'I will take the left');
      await typeInto(secondPage.getByTestId('team-chat__draft'), 'and I will take the right');

      /*
       * Order is whichever ping the server saw first, which is a race nobody should assert
       * on; both names and the plural verb are the thing that matters.
       */
      await expect(typingLine(captainPage)).toContainText(first, { timeout: 10_000 });
      await expect(typingLine(captainPage)).toContainText(second);
      await expect(typingLine(captainPage)).toContainText('are typing…');
      await captainPage.screenshot({ path: `screenshots/ft-typing-two-${stamp()}.png` });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });

  /**
   * The constraint the whole feature was given: this is published to the team's room and
   * nowhere else. A participant in a different team, with their own room open, must see
   * nothing — and neither must the nav dot, which is what would turn a cosmetic hint into a
   * notification three hundred people did not ask for.
   */
  test('nobody outside the team hears a thing', async ({ browser, request }) => {
    const insider = unique('Inside');
    const outsider = unique('Outside');
    await apiSignUp(request, { nickname: insider });
    await apiSignUp(request, { nickname: outsider });

    const insiderContext = await browser.newContext();
    const outsiderContext = await browser.newContext();
    try {
      const insiderPage = await insiderContext.newPage();
      const outsiderPage = await outsiderContext.newPage();
      await signInParticipant(insiderPage, insider, '1234');
      await signInParticipant(outsiderPage, outsider, '1234');

      await createTeam(insiderPage, unique('Alpha').slice(0, 30));
      await createTeam(outsiderPage, unique('Beta').slice(0, 30));
      await insiderPage.goto('/team');
      await outsiderPage.goto('/team');
      await expect(outsiderPage.getByTestId('team-chat__draft')).toBeVisible({ timeout: 15_000 });

      await typeInto(insiderPage.getByTestId('team-chat__draft'), 'this is for my team only');

      /*
       * Waiting out a full ping window and then asserting silence: a negative that passes
       * instantly has proven nothing. The outsider's own room stays blank, and their nav stays
       * dark — a typing frame must never light an alert.
       */
      await outsiderPage.waitForTimeout(TEAM_CHAT_TYPING_PING_MS + 2_000);
      await expect(typingLine(outsiderPage)).toHaveText('');
      await expect(outsiderPage.getByTestId('gameboy-shell__nav-alert').filter({ hasText: 'Unread team messages' })).toBeHidden();
    } finally {
      await insiderContext.close();
      await outsiderContext.close();
    }
  });
});
