import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { messages } from '@psd/contracts';
import { App } from './App.js';
import { AppRouter } from './AppRouter.js';
import { SessionProvider } from './components/shared/SessionProvider.js';
import { installFetchStub, type FetchStub, type RouteTable } from './test-utils/fetchStub.js';
import {
  facilitatorShellRoutes,
  participantShellRoutes,
  superadminShellRoutes,
} from './test-utils/ambientRoutes.js';
import {
  activityFixture,
  courtFixture,
  facilitatorSession,
  participantSession,
  superadminSession,
} from './test-utils/fixtures.js';

/**
 * The route table and its three guards (fds.md §9.3): a signed-out visitor lands on the
 * sign-in surface for the area they asked for, and an actor of the wrong type is bounced to
 * their own home instead of being shown a console they may not use.
 */

let stub: FetchStub;

afterEach(() => stub?.restore());

const signedOut: RouteTable = {
  'GET /api/auth/session': { status: 401, body: { error: { message: messages.signInRequired } } },
};

function renderAt(path: string, routes: RouteTable) {
  stub = installFetchStub({
    ...participantShellRoutes(),
    ...facilitatorShellRoutes(),
    ...superadminShellRoutes(),
    ...routes,
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('route guards', () => {
  it('shows the loading state while the session is still being restored', () => {
    renderAt('/home', { 'GET /api/auth/session': { body: participantSession } });
    expect(screen.getByText('Loading…')).toBeVisible();
  });

  it('sends a signed-out visitor to the participant sign-in', async () => {
    renderAt('/home', signedOut);
    expect(await screen.findByTestId('signin-form__nickname')).toBeVisible();
  });

  it('sends a signed-out visitor to the facilitator sign-in', async () => {
    renderAt('/staff/sync', signedOut);
    expect(await screen.findByTestId('staff-signin__username')).toBeVisible();
  });

  it('sends a signed-out visitor to the superadmin sign-in', async () => {
    renderAt('/admin/points', signedOut);
    expect(await screen.findByTestId('admin-signin__username')).toBeVisible();
  });

  it('bounces a facilitator away from the superadmin console to their own home', async () => {
    renderAt('/admin', {
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/tournament/courts': { body: { items: [courtFixture] } },
      'GET /api/fringe/activities': { body: { items: [activityFixture] } },
    });
    expect(await screen.findAllByTestId('staff-home__station')).toHaveLength(2);
  });

  it('bounces a participant away from the staff console to their badge', async () => {
    renderAt('/staff', {
      'GET /api/auth/session': { body: participantSession },
      'GET /api/me': {
        body: {
          participant: participantSession.participant,
          totals: { fringePoints: 0, tournamentPoints: 0, totalPoints: 0, scanCount: 0 },
          team: null,
        },
      },
    });
    expect(await screen.findByTestId('qr-home__profile')).toBeVisible();
  });

  it('redirects an unknown URL to the landing page', async () => {
    renderAt('/not-a-surface', signedOut);
    expect(await screen.findByTestId('landing__signup')).toBeVisible();
  });
});

describe('route table', () => {
  it('serves the superadmin dashboard to a signed-in superadmin', async () => {
    renderAt('/admin', {
      'GET /api/auth/session': { body: superadminSession },
      'GET /api/admin/dashboard': {
        body: {
          status: {
            participantCount: 1,
            teamCount: 0,
            matchCount: 0,
            scanCount: 0,
            courtCount: 1,
            enabledCourtCount: 1,
            activityCount: 1,
            activeActivityCount: 1,
            facilitatorCount: 1,
            superadminCount: 1,
            isPointConfigSet: true,
          },
        },
      },
    });
    expect(await screen.findAllByTestId('dashboard__tile')).toHaveLength(8);
  });

  it('serves the public sign-up surface without a session', async () => {
    renderAt('/signup', { ...signedOut, 'GET /api/clusters': { body: { items: [] } } });
    expect(await screen.findByTestId('signup-form__nickname')).toBeVisible();
  });
});

describe('AppRouter (ADR-287)', () => {
  it('routes from the address bar, as main.tsx mounts it', async () => {
    stub = installFetchStub({ ...participantShellRoutes(), ...signedOut });
    window.history.pushState(null, '', '/not-a-surface');
    render(
      <AppRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </AppRouter>,
    );
    expect(await screen.findByTestId('landing__signup')).toBeVisible();
    window.history.pushState(null, '', '/');
  });
});
