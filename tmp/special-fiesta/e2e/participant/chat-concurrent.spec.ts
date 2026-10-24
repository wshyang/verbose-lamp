import { expect, test, type Locator, type Page } from '@playwright/test';
import { apiSignUp, signInParticipant, typeInto, unique, stamp } from '../support/fixtures.js';

/**
 * Global chat — concurrent two-context tests (ADR-046).
 *
 * What the existing chat.spec.ts does NOT prove: the Social nav LED (the red dot on the tab)
 * lights while the receiver is elsewhere, and clears the moment they open the room. The LED is
 * rendered by GameboyShell on a different route from the ChatPanel that clears it, so only a
 * real browser holding real navigation state can prove their contract together.
 *
 * Chromium only: EventSource is uniformly supported; two live SSE contexts in one worker is
 * well-behaved with workers: 1 and fullyParallel: false.
 */

function runStamp(): string {
  return Math.random().toString(36).slice(-5);
}

/** The Social tab's alert dot — distinct from the team tab's dot. */
function socialLight(page: Page): Locator {
  return page
    .getByTestId('gameboy-shell__nav-alert')
    .filter({ hasText: 'New chat messages or photos' });
}

test.describe('global chat — concurrent sessions', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Two live SSE contexts are proven once; the engines do not differ on EventSource.',
  );

  test(
    'message from A appears on B via SSE, and the Social LED clears when B opens the room',
    async ({ browser, request }) => {
      const sender = unique('Sender');
      const reader = unique('Reader');
      await apiSignUp(request, { nickname: sender });
      await apiSignUp(request, { nickname: reader });

      const senderContext = await browser.newContext();
      const readerContext = await browser.newContext();
      try {
        const senderPage = await senderContext.newPage();
        const readerPage = await readerContext.newPage();

        await signInParticipant(senderPage, sender, '1234');
        await signInParticipant(readerPage, reader, '1234');

        // Reader stays on the home/QR page — room is NOT open, so the LED can light.
        await readerPage.goto('/home');

        // Sender opens the chat room and sends a message.
        await senderPage.goto('/social/chat');
        await expect(senderPage.getByTestId('chat-panel__draft')).toBeVisible();

        const said = `hello from sender ${runStamp()}`;
        await typeInto(senderPage.getByTestId('chat-panel__draft'), said);
        await senderPage.getByTestId('chat-panel__send').click();
        await expect(
          senderPage.getByTestId('chat-panel__message').filter({ hasText: said }),
        ).toBeVisible();

        // Reader's LED lights after a reload (server-side watermark; the alerts poll runs every
        // 45–75 s, so the spec reloads as team-chat.spec.ts does rather than waiting the poll out).
        await readerPage.reload();
        await expect(socialLight(readerPage)).toBeVisible({ timeout: 15_000 });
        await readerPage.screenshot({ path: `screenshots/ft-chat-led-on-${stamp()}.png` });

        // Reader opens the room — the message is there and the LED is immediately removed from DOM.
        await readerPage.goto('/social/chat');
        await expect(
          readerPage.getByTestId('chat-panel__message').filter({ hasText: said }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(socialLight(readerPage)).toBeHidden();
        await readerPage.screenshot({ path: `screenshots/ft-chat-led-cleared-${stamp()}.png` });

        // Navigating away and back: the dot stays off because the mark is on the server.
        await readerPage.goto('/home');
        await expect(socialLight(readerPage)).toBeHidden();
      } finally {
        await senderContext.close();
        await readerContext.close();
      }
    },
  );

  test(
    'reverse direction: B sends, A (not in the room) sees the LED, opens room, LED clears',
    async ({ browser, request }) => {
      const alpha = unique('Alpha');
      const beta = unique('Beta');
      await apiSignUp(request, { nickname: alpha });
      await apiSignUp(request, { nickname: beta });

      const alphaContext = await browser.newContext();
      const betaContext = await browser.newContext();
      try {
        const alphaPage = await alphaContext.newPage();
        const betaPage = await betaContext.newPage();

        await signInParticipant(alphaPage, alpha, '1234');
        await signInParticipant(betaPage, beta, '1234');

        // Alpha stays off the room.
        await alphaPage.goto('/board');

        // Beta sends.
        await betaPage.goto('/social/chat');
        await expect(betaPage.getByTestId('chat-panel__draft')).toBeVisible();
        const said = `beta calling alpha ${runStamp()}`;
        await typeInto(betaPage.getByTestId('chat-panel__draft'), said);
        await betaPage.getByTestId('chat-panel__send').click();
        await expect(
          betaPage.getByTestId('chat-panel__message').filter({ hasText: said }),
        ).toBeVisible();

        // Alpha's LED lights on reload.
        await alphaPage.reload();
        await expect(socialLight(alphaPage)).toBeVisible({ timeout: 15_000 });

        // Alpha opens the room — message visible, LED element removed from DOM.
        await alphaPage.goto('/social/chat');
        await expect(
          alphaPage.getByTestId('chat-panel__message').filter({ hasText: said }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(socialLight(alphaPage)).toBeHidden();
        await alphaPage.screenshot({ path: `screenshots/ft-chat-concurrent-reverse-${stamp()}.png` });
      } finally {
        await alphaContext.close();
        await betaContext.close();
      }
    },
  );
});
