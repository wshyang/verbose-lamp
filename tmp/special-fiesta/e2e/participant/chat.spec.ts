import { expect, test } from '@playwright/test';
import { apiSignUp, signInParticipant, typeInto, unique, stamp } from '../support/fixtures.js';

/**
 * The chat room, end to end (ADR-046).
 *
 * This is the one test that can prove the push actually pushes: two real browser contexts, one
 * typing and one only watching, with nothing polling in between. Everything below the UI is
 * real — a real SSE connection, the real in-process bus, the real database.
 *
 * Chromium only, deliberately. The suite runs four projects (ADR-043), and holding two live
 * SSE contexts open per engine buys very little: what differs between engines is `EventSource`
 * itself, which is uniformly supported, and the hook's own decisions are unit-tested against
 * both a present and an absent `EventSource`. The config runs `workers: 1` and
 * `fullyParallel: false`, so two contexts inside one spec is well-behaved.
 */

/** Keeps the asserted text unique per run, so a re-run cannot match an older row. */
function runStamp(): string {
  return Math.random().toString(36).slice(-5);
}

test.describe('the chat room', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Two live SSE contexts are proven once; the engines do not differ on EventSource.',
  );

  test('a message typed in one browser appears in another without a reload', async ({
    browser,
    request,
  }) => {
    const talker = unique('Talker');
    const watcher = unique('Watcher');
    await apiSignUp(request, { nickname: talker });
    await apiSignUp(request, { nickname: watcher });

    const talkerContext = await browser.newContext();
    const watcherContext = await browser.newContext();

    try {
      const talkerPage = await talkerContext.newPage();
      const watcherPage = await watcherContext.newPage();

      await signInParticipant(talkerPage, talker, '1234');
      await signInParticipant(watcherPage, watcher, '1234');

      await talkerPage.goto('/social/chat');
      await watcherPage.goto('/social/chat');
      await expect(talkerPage.getByTestId('chat-panel__draft')).toBeVisible();
      await expect(watcherPage.getByTestId('chat-panel__draft')).toBeVisible();

      const said = `court three is free ${runStamp()}`;
      await typeInto(talkerPage.getByTestId('chat-panel__draft'), said);
      await talkerPage.getByTestId('chat-panel__send').click();

      // The sender sees their own line immediately (the optimistic merge).
      await expect(
        talkerPage.getByTestId('chat-panel__message').filter({ hasText: said }),
      ).toBeVisible();

      // The watcher never reloaded and nothing polls this fast: arriving here means it was
      // pushed. This assertion is the entire point of the spec.
      await expect(
        watcherPage.getByTestId('chat-panel__message').filter({ hasText: said }),
      ).toBeVisible({ timeout: 15_000 });

      // The box empties on success, and the author is labelled.
      await expect(talkerPage.getByTestId('chat-panel__draft')).toHaveValue('');
      await expect(watcherPage.getByTestId('chat-panel__message').last()).toContainText(talker);

      await watcherPage.screenshot({ path: `screenshots/ft-chat-push-${stamp()}.png` });
    } finally {
      await talkerContext.close();
      await watcherContext.close();
    }
  });

  test('refuses an empty send and whitespace alone', async ({ page, request }) => {
    const nickname = unique('Quiet');
    await apiSignUp(request, { nickname });
    await signInParticipant(page, nickname, '1234');
    await page.goto('/social/chat');

    const draft = page.getByTestId('chat-panel__draft');
    await expect(draft).toBeVisible();

    // Nothing typed, and whitespace alone, both leave the button unusable rather than
    // producing a row nobody can read.
    await expect(page.getByTestId('chat-panel__send')).toBeDisabled();
    await draft.fill('   ');
    await expect(page.getByTestId('chat-panel__send')).toBeDisabled();

    await page.screenshot({ path: `screenshots/ft-chat-guards-${stamp()}.png` });
  });
});
