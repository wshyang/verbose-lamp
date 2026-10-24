import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CLUSTER_CODES, messages } from '@psd/contracts';
import { App } from '../App.js';
import { SessionProvider } from '../components/shared/SessionProvider.js';
import { installFetchStub } from '../test-utils/fetchStub.js';
import type { FetchStub, RouteTable, StubResponse } from '../test-utils/fetchStub.js';
import { participantFixture, participantSession } from '../test-utils/fixtures.js';
import { facilitatorShellRoutes, participantShellRoutes } from '../test-utils/ambientRoutes.js';

/**
 * F1/F3 hand-off: the moment a participant authenticates, the guard on the surface they are
 * sent to must wait for the refreshed session instead of reading the stale signed-out one.
 * Getting this wrong bounced every new sign-up straight back to the sign-in form, which is
 * exactly what a fresh participant reported on the beach.
 *
 * These run against the real route table so the guard is in the loop — the page-level
 * sign-up/sign-in specs mount a single surface and cannot see this.
 */

let stub: FetchStub;

afterEach(() => stub?.restore());

const totals = { fringePoints: 0, tournamentPoints: 0, totalPoints: 0, scanCount: 0 };

/** The server issues the cookie on sign-up/sign-in, so the session endpoint flips afterwards. */
function sessionThatStartsSignedOut(): { route: StubResponse | (() => StubResponse); signIn: () => void } {
  let isSignedIn = false;
  return {
    // 25ms of latency: the bug this file guards only appears while the refetch is in flight.
    route: () =>
      isSignedIn
        ? { body: participantSession, delayMs: 25 }
        : { status: 401, body: { error: { message: messages.signInRequired } }, delayMs: 25 },
    signIn: () => {
      isSignedIn = true;
    },
  };
}

function renderAt(path: string, routes: RouteTable) {
  stub = installFetchStub({ ...participantShellRoutes(), ...facilitatorShellRoutes(), ...routes });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('authentication hand-off (F1, F3)', () => {
  it('lands a new participant on their badge instead of bouncing them to sign-in', async () => {
    const session = sessionThatStartsSignedOut();
    renderAt('/signup', {
      'GET /api/auth/session': session.route,
      'GET /api/clusters': {
        body: { items: CLUSTER_CODES.map((code) => ({ code, displayName: code })) },
      },
      'POST /api/auth/participants/signup': () => {
        session.signIn();
        return { status: 201, body: { participant: participantFixture } };
      },
      'GET /api/me': { body: { participant: participantFixture, totals } },
    });

    const user = userEvent.setup();
    await user.type(await screen.findByTestId('signup-form__nickname'), 'BeachBoss');
    await user.type(screen.getByTestId('signup-form__pin'), '4821');
    await user.selectOptions(screen.getByTestId('signup-form__cluster'), 'CHROO');
    await user.click(screen.getByTestId('signup-form__gender-female'));
    await user.click(screen.getAllByTestId('signup-form__avatar')[2] as HTMLElement);
    await user.click(screen.getByTestId('signup-form__submit'));

    expect(await screen.findByTestId('qr-home__profile')).toBeVisible();
    expect(screen.queryByTestId('signin-form__nickname')).toBeNull();
  });

  it('lands a returning participant on their badge after signing in', async () => {
    const session = sessionThatStartsSignedOut();
    renderAt('/signin', {
      'GET /api/auth/session': session.route,
      'POST /api/auth/participants/signin': () => {
        session.signIn();
        return { body: { participant: participantFixture } };
      },
      'GET /api/me': { body: { participant: participantFixture, totals } },
    });

    const user = userEvent.setup();
    await user.type(await screen.findByTestId('signin-form__nickname'), 'BeachBoss');
    await user.type(screen.getByTestId('signin-form__pin'), '4821');
    await user.click(screen.getByTestId('signin-form__submit'));

    expect(await screen.findByTestId('qr-home__profile')).toBeVisible();
  });

  it('keeps a rejected sign-in on the form with the FDS message', async () => {
    renderAt('/signin', {
      'GET /api/auth/session': { status: 401, body: { error: { message: messages.signInRequired } } },
      'POST /api/auth/participants/signin': {
        status: 401,
        body: { error: { message: messages.signInRejected } },
      },
    });

    const user = userEvent.setup();
    await user.type(await screen.findByTestId('signin-form__nickname'), 'BeachBoss');
    await user.type(screen.getByTestId('signin-form__pin'), '0000');
    await user.click(screen.getByTestId('signin-form__submit'));

    expect(await screen.findByTestId('signin-form__error')).toHaveTextContent(messages.signInRejected);
    expect(screen.getByTestId('signin-form__nickname')).toBeVisible();
  });

  it('signs in through the bearer token when the browser refuses the cookie (ADR-016)', async () => {
    // The embedded case: the browser drops the Set-Cookie, so the only thing that can carry
    // the session is the token the sign-up response handed back.
    const seen: string[] = [];
    renderAt('/signup', {
      'GET /api/auth/session': ({ headers }) => {
        seen.push(String(headers['authorization'] ?? ''));
        return headers['authorization'] === 'Bearer token-from-signup'
          ? { body: participantSession, delayMs: 25 }
          : { status: 401, body: { error: { message: messages.signInRequired } }, delayMs: 25 };
      },
      'GET /api/clusters': {
        body: { items: CLUSTER_CODES.map((code) => ({ code, displayName: code })) },
      },
      'POST /api/auth/participants/signup': {
        status: 201,
        body: { participant: participantFixture, sessionToken: 'token-from-signup' },
      },
      'GET /api/me': { body: { participant: participantFixture, totals } },
    });

    const user = userEvent.setup();
    await user.type(await screen.findByTestId('signup-form__nickname'), 'BeachBoss');
    await user.type(screen.getByTestId('signup-form__pin'), '4821');
    await user.selectOptions(screen.getByTestId('signup-form__cluster'), 'CHROO');
    await user.click(screen.getByTestId('signup-form__gender-female'));
    await user.click(screen.getAllByTestId('signup-form__avatar')[2] as HTMLElement);
    await user.click(screen.getByTestId('signup-form__submit'));

    expect(await screen.findByTestId('qr-home__profile')).toBeVisible();
    expect(seen).toContain('Bearer token-from-signup');
  });

  it('explains itself when neither the cookie nor the token can restore the session', async () => {
    renderAt('/signup', {
      'GET /api/auth/session': {
        status: 401,
        body: { error: { message: messages.signInRequired } },
        delayMs: 25,
      },
      'GET /api/clusters': {
        body: { items: CLUSTER_CODES.map((code) => ({ code, displayName: code })) },
      },
      'POST /api/auth/participants/signup': { status: 201, body: { participant: participantFixture } },
    });

    const user = userEvent.setup();
    await user.type(await screen.findByTestId('signup-form__nickname'), 'BeachBoss');
    await user.type(screen.getByTestId('signup-form__pin'), '4821');
    await user.selectOptions(screen.getByTestId('signup-form__cluster'), 'CHROO');
    await user.click(screen.getByTestId('signup-form__gender-female'));
    await user.click(screen.getAllByTestId('signup-form__avatar')[2] as HTMLElement);
    await user.click(screen.getByTestId('signup-form__submit'));

    expect(await screen.findByTestId('signup-form__error')).toHaveTextContent(
      messages.sessionNotStored,
    );
    // It stays put instead of dumping the participant on a sign-in form with no explanation.
    expect(screen.getByTestId('signup-form__nickname')).toBeVisible();
  });

  it('says the same thing on the staff console, in console clothing', async () => {
    renderAt('/staff/signin', {
      'GET /api/auth/session': {
        status: 401,
        body: { error: { message: messages.signInRequired } },
        delayMs: 25,
      },
      'POST /api/auth/facilitators/signin': { body: {} },
    });

    const user = userEvent.setup();
    await user.type(await screen.findByTestId('staff-signin__username'), 'court1');
    await user.type(screen.getByTestId('staff-signin__passcode'), '1111');
    await user.click(screen.getByTestId('staff-signin__submit'));

    expect(await screen.findByTestId('staff-signin__error')).toHaveTextContent(
      messages.sessionNotStored,
    );
  });

  it('sends a facilitator to their station home after signing in', async () => {
    let isSignedIn = false;
    renderAt('/staff/signin', {
      'GET /api/auth/session': () =>
        isSignedIn
          ? {
              delayMs: 25,
              body: {
                actorType: 'facilitator',
                staff: { id: '22222222-2222-4222-8222-222222222222', username: 'court1', displayLabel: 'Court 1' },
                defaultStation: null,
              },
            }
          : { status: 401, body: { error: { message: messages.signInRequired } }, delayMs: 25 },
      'POST /api/auth/facilitators/signin': () => {
        isSignedIn = true;
        return { body: {} };
      },
      'GET /api/tournament/courts': { body: { items: [] } },
      'GET /api/fringe/activities': { body: { items: [] } },
    });

    const user = userEvent.setup();
    await user.type(await screen.findByTestId('staff-signin__username'), 'court1');
    await user.type(screen.getByTestId('staff-signin__passcode'), '1111');
    await user.click(screen.getByTestId('staff-signin__submit'));

    await waitFor(() => expect(screen.queryByTestId('staff-signin__username')).toBeNull());
    expect(await screen.findByTestId('console-shell__signout')).toBeVisible();
  });
});
