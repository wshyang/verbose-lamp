import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { messages } from '@psd/contracts';
import { App } from '../App.js';
import { SessionProvider } from '../components/shared/SessionProvider.js';
import { installFetchStub } from '../test-utils/fetchStub.js';
import type { FetchStub, RouteTable } from '../test-utils/fetchStub.js';
import { participantFixture, participantSession } from '../test-utils/fixtures.js';
import { forgetLastPath, readLastPath, writeLastPath } from '../lib/session/locationStore.js';
import { participantShellRoutes } from '../test-utils/ambientRoutes.js';

/**
 * ADR-019 — a reload must not cost the actor their place.
 *
 * Every surface already has its own URL, so a browser that keeps its address bar does this
 * unaided. These cover the two cases on event day that do not: a phone that drops the tab
 * under memory pressure and reopens at the start URL, and an embedded frame whose container
 * re-mounts it at `src`. Both come back at "/" with the session still valid.
 */

let stub: FetchStub;

afterEach(() => {
  stub?.restore();
  forgetLastPath();
  window.localStorage.clear();
});

const totals = {
  fringePoints: 0,
  tournamentPoints: 0,
  totalPoints: 0,
  scanCount: 0,
  passport: { stationsVisited: 0, stationsRequired: 4, bonusPoints: 0, isEarned: false },
};

const leaderboard = {
  clusters: [
    {
      clusterCode: 'BP',
      displayName: 'BP',
      rank: 1,
      totalPoints: 120,
      fringePoints: 90,
      tournamentPoints: 30,
      participantCount: 12,
    },
  ],
  topIndividuals: [],
  generatedAt: '2026-09-29T03:00:00.000Z',
};

const SIGNED_IN: RouteTable = {
  ...participantShellRoutes(),
  'GET /api/auth/session': { body: participantSession, delayMs: 10 },
  'GET /api/me': { body: { participant: participantFixture, totals } },
  'GET /api/leaderboard': { body: leaderboard },
  'GET /api/me/scans': { body: { items: [], totals } },
  'POST /api/auth/signout': { body: { ok: true } },
};

const SIGNED_OUT: RouteTable = {
  'GET /api/auth/session': {
    status: 401,
    body: { error: { message: messages.signInRequired } },
    delayMs: 10,
  },
};

function renderAt(path: string, routes: RouteTable) {
  stub = installFetchStub(routes);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('surface memory across a reload (ADR-019)', () => {
  it('puts a signed-in participant back on the surface they were using', async () => {
    writeLastPath('/board');

    // The container reloaded the app at its start URL, not at /board.
    renderAt('/', SIGNED_IN);

    expect(await screen.findByTestId('leaderboard__row')).toBeVisible();
  });

  it('records the surface as the actor moves between them', async () => {
    const view = renderAt('/home', SIGNED_IN);
    expect(await screen.findByTestId('qr-home__profile')).toBeVisible();
    await waitFor(() => expect(readLastPath()).toBe('/home'));

    const board = screen
      .getAllByTestId('gameboy-shell__nav-link')
      .find((link) => link.textContent?.includes('Board'));
    await userEvent.click(board as HTMLElement);

    expect(await screen.findByTestId('leaderboard__row')).toBeVisible();
    await waitFor(() => expect(readLastPath()).toBe('/board'));

    // And that is what a rebuilt page comes back to.
    view.unmount();
    renderAt('/', SIGNED_IN);
    expect(await screen.findByTestId('leaderboard__row')).toBeVisible();
  });

  it('leaves a signed-out visitor on the front door, whatever was remembered', async () => {
    writeLastPath('/board');

    renderAt('/', SIGNED_OUT);

    expect(await screen.findByTestId('landing__signup')).toBeVisible();
  });

  it('shows the front door when there is nothing to come back to', async () => {
    renderAt('/', SIGNED_IN);

    expect(await screen.findByTestId('landing__signin')).toBeVisible();
    expect(readLastPath()).toBeNull();
  });

  it('only restores on the way in, never when the actor asks for the front door', async () => {
    writeLastPath('/board');
    renderAt('/home', SIGNED_IN);
    expect(await screen.findByTestId('qr-home__profile')).toBeVisible();

    await userEvent.click(screen.getByTestId('qr-home__profile'));

    expect(await screen.findByTestId('profile__signout')).toBeVisible();
  });

  it('forgets the trail when the actor signs out', async () => {
    writeLastPath('/board');
    renderAt('/me', SIGNED_IN);

    await userEvent.click(await screen.findByTestId('profile__signout'));

    await waitFor(() => expect(readLastPath()).toBeNull());
  });
});
