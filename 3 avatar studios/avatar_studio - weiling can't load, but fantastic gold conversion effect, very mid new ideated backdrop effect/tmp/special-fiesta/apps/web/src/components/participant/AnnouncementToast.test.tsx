import type { AnnouncementView } from '@psd/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameboyShell } from './GameboyShell.js';
import { AlertsProvider } from './AlertsProvider.js';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { renderWithProviders } from '../../test-utils/renderWithProviders.js';
import { readAnnouncementFloor } from '../../lib/storage/announcementStore.js';

/**
 * ADR-074 — the announcement toast. ADR-082 — and how far back it reaches.
 *
 * Driven through `GameboyShell` rather than the component in isolation, because the point of the
 * feature is *where* it appears: over the banner, on every participant surface, regardless of which
 * route is underneath. Rendering the toast alone would prove nothing about that.
 *
 * Every test here starts on an unseeded browser, so the first poll seeds the floor from whatever the
 * stub is offering — which is the arriving participant's case, and the one ADR-082 is about.
 */

let stub: FetchStub | undefined;

function announcement(id: string, body: string): AnnouncementView {
  return { id, body, authorLabel: 'superadmin', createdAt: '2026-09-30T08:00:00.000Z' };
}

const FIRST = '01a0f000-0000-7000-8000-0000000000a1';
const SECOND = '01a0f000-0000-7000-8000-0000000000a2';

function shellWith(announcements: AnnouncementView[]) {
  stub = installFetchStub({
    'GET /api/auth/session': {
      body: { actorType: 'participant', participant: { id: 'p1', nickname: 'Reader' } },
    },
    // ADR-074 — the server's list is the same for everybody; dismissal is filtered in the browser.
    'GET /api/me/alerts': { body: { teamUpSoon: { upSoon: false, gamesAway: null, fixtureId: null }, announcements } },
  });
  /*
   * ADR-125 — wrapped the way `App` wraps it. The alerts store moved out of the shell and into
   * the participant guard, so a shell rendered bare has no store behind it.
   */
  return renderWithProviders(
    <AlertsProvider>
      <GameboyShell title="BOARD">
        <p>the app underneath</p>
      </GameboyShell>
    </AlertsProvider>,
  );
}

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('the announcement toast', () => {
  it('appears over the banner on whatever surface the participant is on', async () => {
    shellWith([announcement(FIRST, 'Finals start at 4pm on court 1')]);

    expect(await screen.findByTestId('announcement-toast')).toBeVisible();
    expect(screen.getByTestId('announcement-toast__body')).toHaveTextContent(
      'Finals start at 4pm on court 1',
    );
    // The app is still there underneath; the toast adds to the surface rather than replacing it.
    expect(screen.getByText('the app underneath')).toBeVisible();
  });

  it('is nothing at all when there is nothing to announce', async () => {
    shellWith([]);

    await waitFor(() => expect(screen.getByText('the app underneath')).toBeVisible());
    // Not an empty box, not a placeholder: absent.
    expect(screen.queryByTestId('announcement-toast')).toBeNull();
  });

  it('goes away when tapped, and is remembered in this browser', async () => {
    shellWith([announcement(FIRST, 'Rain delay, back in twenty')]);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('announcement-toast'));

    await waitFor(() => expect(screen.queryByTestId('announcement-toast')).toBeNull());
    /*
     * Asserting the STORED value, not just that the element left the screen. A toast that disappears
     * locally without being written down comes back on the next poll, which is exactly the shape of
     * the team-chat LED bug in ADR-063 — and with no server call involved, storage is the only thing
     * that can carry the fact.
     *
     * ADR-082 — what is written is the floor, now at the announcement just dismissed.
     */
    expect(readAnnouncementFloor()).toBe(FIRST);
  });

  it('stays gone across a remount, because the browser remembered it', async () => {
    const live = [announcement(FIRST, 'Prize table is open')];
    const first = shellWith(live);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('announcement-toast'));
    await waitFor(() => expect(screen.queryByTestId('announcement-toast')).toBeNull());
    first.unmount();
    stub?.restore();

    // A fresh mount, the server still offering the same announcement: it must not come back.
    shellWith(live);

    await waitFor(() => expect(screen.getByText('the app underneath')).toBeVisible());
    expect(screen.queryByTestId('announcement-toast')).toBeNull();
  });

  it('shows only the last announcement made before the participant arrived', async () => {
    // Two already live at sign-in. ADR-082: the newest sticks, everything older is ignored.
    shellWith([
      announcement(FIRST, 'Kueh at the prize table'),
      announcement(SECOND, 'Tug of war moved north'),
    ]);

    /*
     * The case this rule exists for: someone signing in at 15:55 needs "finals start at 4pm", not the
     * whole morning. Ignoring everything from before sign-in would have lost it; this keeps exactly one.
     */
    expect(await screen.findByTestId('announcement-toast__body')).toHaveTextContent(
      'Tug of war moved north',
    );
    // And the older one is not queued behind it — it is ignored, not deferred.
    expect(readAnnouncementFloor()).toBe(FIRST);
  });

  it('stacks announcements made after sign-in, oldest first and none hidden (ADR-183)', async () => {
    // Nothing live on arrival, so nothing is ignored and the floor is empty.
    const first = shellWith([]);
    await waitFor(() => expect(screen.getByText('the app underneath')).toBeVisible());
    expect(readAnnouncementFloor()).toBeNull();
    first.unmount();
    stub?.restore();

    // Two announcements arrive during the event. Both are above the floor, so both are shown.
    shellWith([
      announcement(FIRST, 'Kueh at the prize table'),
      announcement(SECOND, 'Tug of war moved north'),
    ]);
    const user = userEvent.setup();

    /*
     * ADR-183 reverses ADR-074's queue. It showed `announcements[0]` only, which meant the
     * OLDEST undismissed message covered every newer one — so the most recent thing the
     * organisers said was the thing nobody could see. Both are on screen now.
     */
    await waitFor(() => expect(screen.getAllByTestId('announcement-toast')).toHaveLength(2));
    const bodies = screen.getAllByTestId('announcement-toast__body');
    expect(bodies[0]).toHaveTextContent('Kueh at the prize table');
    expect(bodies[1]).toHaveTextContent('Tug of war moved north');

    // Dismissing one takes that one away and leaves the other exactly where it was.
    await user.click(screen.getAllByTestId('announcement-toast')[0] as HTMLElement);
    await waitFor(() => expect(screen.getAllByTestId('announcement-toast')).toHaveLength(1));
    expect(screen.getByTestId('announcement-toast__body')).toHaveTextContent(
      'Tug of war moved north',
    );
  });

  it('keeps ignoring the backlog across a remount, because the floor was written down', async () => {
    const live = [
      announcement(FIRST, 'Kueh at the prize table'),
      announcement(SECOND, 'Tug of war moved north'),
    ];
    const first = shellWith(live);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('announcement-toast'));
    await waitFor(() => expect(screen.queryByTestId('announcement-toast')).toBeNull());
    first.unmount();
    stub?.restore();

    /*
     * A fresh mount with the same two still live. The floor is seeded once and only advances, so
     * neither comes back — and in particular the browser must NOT re-seed and treat the older one as
     * newly arrived, which is the failure `hasAnnouncementFloor()` rather than `floor === null` exists
     * to prevent.
     */
    shellWith(live);

    await waitFor(() => expect(screen.getByText('the app underneath')).toBeVisible());
    expect(screen.queryByTestId('announcement-toast')).toBeNull();
    expect(readAnnouncementFloor()).toBe(SECOND);
  });

  it('is a button, so it can be dismissed without a pointer', async () => {
    shellWith([announcement(FIRST, 'Prize ceremony now')]);

    const toast = await screen.findByTestId('announcement-toast');

    // The whole toast is the control — there is no small × to hit with wet hands in the sun — and
    // being a real button is what makes it reachable by keyboard and announced as pressable.
    expect(toast.tagName).toBe('BUTTON');
  });
});
