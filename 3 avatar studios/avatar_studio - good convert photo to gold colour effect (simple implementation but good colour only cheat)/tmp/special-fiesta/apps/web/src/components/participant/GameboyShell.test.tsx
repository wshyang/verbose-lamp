import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameboyShell } from './GameboyShell.js';
import { AlertsProvider } from './AlertsProvider.js';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { renderWithProviders } from '../../test-utils/renderWithProviders.js';
import type { FeedMarks } from '../../lib/storage/feedReadStore.js';

/**
 * The nav LEDs (ADR-063, ADR-083) — driven through `GameboyShell` because the point is *where*
 * the dots appear: on the Teams and Social tabs of every participant surface, fed by the one
 * alerts poll. The e2e suite covers the team dot's full lifecycle; this pins the render contract,
 * including the visually-hidden text a bare coloured circle owes a screen reader.
 *
 * ADR-125 — a dot is now a comparison, so each case needs both halves: what this device has
 * already read, written into storage as a device that has been here before, and what the server
 * says the feeds are at. A device with nothing stored is seeded dark by design, which is why
 * every lit case below starts from a stored mark.
 */

const EARLIER = '2026-09-30T02:00:00.000Z';
const LATER = '2026-09-30T02:05:00.000Z';

let stub: FetchStub | undefined;

const NOTHING_READ: FeedMarks = { chat: null, teamChat: null, gallery: null };

const NOT_UP_SOON = { upSoon: false, gamesAway: null, fixtureId: null };
const FIXTURE = '01a0f000-0000-7000-8000-00000000000a';
/** ADR-133 — the call for a named fixture, which is what the toast's floor is keyed on. */
const upSoonAt = (gamesAway: number, fixtureId = FIXTURE) => ({
  upSoon: true,
  gamesAway,
  fixtureId,
});

function shellWith(input: {
  feeds?: Partial<FeedMarks>;
  read?: Partial<FeedMarks>;
  teamUpSoon?: { upSoon: boolean; gamesAway: number | null; fixtureId: string | null };
  announcements?: { id: string; body: string; authorLabel: string; createdAt: string }[];
  /** ADR-300 — where the shell is standing when the nav state is asserted. */
  path?: string;
}) {
  if (input.read) {
    window.localStorage.setItem(
      'psd.feeds.read.v1',
      JSON.stringify({ ...NOTHING_READ, ...input.read }),
    );
  }
  stub = installFetchStub({
    'GET /api/auth/session': {
      body: { actorType: 'participant', participant: { id: 'p1', nickname: 'Reader' } },
    },
    'GET /api/me/alerts': {
      body: {
        teamUpSoon: input.teamUpSoon ?? NOT_UP_SOON,
        feeds: { ...NOTHING_READ, ...input.feeds },
        announcements: input.announcements ?? [],
      },
    },
  });
  // ADR-125 — the store lives above the shell now, exactly as `App` mounts it.
  return renderWithProviders(
    <AlertsProvider>
      <GameboyShell title="BOARD">
        <p>the app underneath</p>
      </GameboyShell>
    </AlertsProvider>,
    input.path === undefined ? undefined : { path: input.path, route: input.path },
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

describe('the nav LEDs', () => {
  it('shows no dot when nothing is unread', async () => {
    shellWith({ feeds: { chat: LATER }, read: { chat: LATER } });

    await waitFor(() => expect(stub?.callsTo('GET /api/me/alerts').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('gameboy-shell__nav-alert')).not.toBeInTheDocument();
  });

  it('lights the Social tab for unread global chat (ADR-083)', async () => {
    shellWith({ feeds: { chat: LATER }, read: { chat: EARLIER } });

    const led = await screen.findByTestId('gameboy-shell__nav-alert');
    expect(led).toHaveTextContent('New chat messages or photos');
    expect(led.closest('a')).toHaveTextContent('Social');
  });

  /*
   * ADR-125 — the gallery lights the same tab as chat, because they share it. The label has to
   * name both: a dot that says "unread chat messages" when a photo lit it sends the reader into
   * the wrong segment and teaches them to distrust the LED.
   */
  it('lights the Social tab for a new photo too, and says so', async () => {
    shellWith({ feeds: { gallery: LATER }, read: { gallery: EARLIER } });

    const led = await screen.findByTestId('gameboy-shell__nav-alert');
    expect(led).toHaveTextContent('New chat messages or photos');
    expect(led.closest('a')).toHaveTextContent('Social');
  });

  it('lights both tabs independently when both rooms have news', async () => {
    shellWith({
      feeds: { chat: LATER, teamChat: LATER },
      read: { chat: EARLIER, teamChat: EARLIER },
    });

    await waitFor(() => expect(screen.getAllByTestId('gameboy-shell__nav-alert')).toHaveLength(2));
    expect(screen.getByText('Unread team messages')).toBeInTheDocument();
    expect(screen.getByText('New chat messages or photos')).toBeInTheDocument();
  });

  /*
   * ADR-125 — the first-sight rule, at the surface the participant actually looks at: a phone
   * that has never stored a mark must show a dark bar however much history the server reports.
   */
  it('shows a fresh device no dots at all, whatever the feeds have been up to', async () => {
    shellWith({ feeds: { chat: LATER, teamChat: LATER, gallery: LATER } });

    await waitFor(() => expect(stub?.callsTo('GET /api/me/alerts').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('gameboy-shell__nav-alert')).not.toBeInTheDocument();
  });

  it('lights the Feed tab when the viewer’s team plays soon (ADR-091)', async () => {
    shellWith({ teamUpSoon: upSoonAt(1) });

    const led = await screen.findByTestId('gameboy-shell__nav-alert');
    expect(led).toHaveTextContent('Your team plays soon');
    expect(led.closest('a')).toHaveTextContent('Feed');
  });

  it('treats a server that does not send the field as quiet', async () => {
    shellWith({});

    await waitFor(() => expect(stub?.callsTo('GET /api/me/alerts').length).toBeGreaterThan(0));
    expect(screen.queryByText('Your team plays soon')).not.toBeInTheDocument();
  });
});

/**
 * ADR-133 (B4) — the up-soon toast, rendered where a participant actually meets it.
 *
 * The store's tests pin when the toast exists; these pin what it says and that tapping it is
 * reachable the way the announcement banner is.
 */
describe('the up-soon toast', () => {
  it('calls the team to its court, and goes away when tapped', async () => {
    const user = userEvent.setup();
    shellWith({ teamUpSoon: upSoonAt(0) });

    const toast = await screen.findByTestId('upsoon-toast');
    expect(toast).toHaveTextContent('up next');
    // A button, not a div with a handler: the whole banner is the dismiss control.
    expect(toast.tagName).toBe('BUTTON');

    await user.click(toast);
    await waitFor(() => expect(screen.queryByTestId('upsoon-toast')).toBeNull());
  });

  it('says how long there is to go when the match is not next', async () => {
    shellWith({ teamUpSoon: upSoonAt(1) });
    const body = await screen.findByTestId('upsoon-toast__body');
    expect(body).toHaveTextContent('one more match');
  });

  /* Deeper in the window the count is not useful to a participant — "soon" is the message. */
  it('does not count matches out loud when the team is further away', async () => {
    shellWith({ teamUpSoon: upSoonAt(3) });
    const body = await screen.findByTestId('upsoon-toast__body');
    expect(body).toHaveTextContent('plays soon');
  });

  it('shares the stack with an announcement, and leads it (ADR-183)', async () => {
    /*
     * It used to return null whenever any announcement was undismissed, because the two shared
     * one overlay slot. ADR-183 gave every alert its own row, so yielding would now mean hiding
     * the only alert here with a deadline behind one that keeps indefinitely.
     */
    shellWith({
      teamUpSoon: upSoonAt(0),
      announcements: [
        {
          id: '01a0f000-0000-7000-8000-000000000001',
          body: 'Lunch is at the pavilion',
          authorLabel: 'superadmin',
          createdAt: EARLIER,
        },
      ],
    });

    await screen.findByTestId('announcement-toast');
    expect(screen.getByTestId('upsoon-toast')).toBeVisible();

    // "Walk to your court now" expires by itself; an announcement waits to be read. So the
    // up-soon call is first in the column, whatever order the two actually arrived in.
    const alerts = screen.getAllByTestId(/^(upsoon|announcement)-toast$/);
    expect(alerts[0]).toHaveAttribute('data-testid', 'upsoon-toast');
  });

  /* The lamp is state and the toast is news; a quiet team has neither. */
  it('is absent when the team is not up soon', async () => {
    shellWith({});
    await screen.findByText('the app underneath');
    expect(screen.queryByTestId('upsoon-toast')).toBeNull();
  });
});

/**
 * ADR-300 — which tab is lit. React Router lights a NavLink only under its own `to`, but
 * `/teams` redirects a participant who already has a team to `/team` (ADR-103) and Social's
 * Photos segment is `/social/photos`, so those tabs showed no highlight at all. The shell
 * marks the alias routes `is-current`, which styles/gameboy.css paints exactly like the
 * router's aria-current state.
 */
describe('the current tab', () => {
  const navLink = (label: string) =>
    screen.getAllByTestId('gameboy-shell__nav-link').find((link) => link.textContent?.includes(label));

  it('lights Teams on /teams through the router', async () => {
    shellWith({ path: '/teams' });
    await screen.findByText('the app underneath');
    expect(navLink('Teams')).toHaveAttribute('aria-current', 'page');
  });

  it('lights Teams on /team, where ADR-103 sends everyone who has a team', async () => {
    shellWith({ path: '/team' });
    await screen.findByText('the app underneath');
    expect(navLink('Teams')).toHaveClass('is-current');
    // …and only Teams: the alias must not bleed onto a neighbour.
    expect(navLink('Board')).not.toHaveClass('is-current');
    expect(navLink('Board')).not.toHaveAttribute('aria-current');
  });

  it('lights Social on /social/photos, the segment outside its `to`', async () => {
    shellWith({ path: '/social/photos' });
    await screen.findByText('the app underneath');
    expect(navLink('Social')).toHaveClass('is-current');
  });
});
