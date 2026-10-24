import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messages } from '@psd/contracts';
import { App } from '../App.js';
import { TestRouter } from '../AppRouter.js';
import { SessionProvider } from '../components/shared/SessionProvider.js';
import { installFetchStub } from '../test-utils/fetchStub.js';
import type { FetchStub, RouteTable } from '../test-utils/fetchStub.js';
import { participantFixture, participantSession } from '../test-utils/fixtures.js';
import { forgetLastPath, readLastPath, writeLastPath } from '../lib/session/locationStore.js';
import { writeSessionToken } from '../lib/session/tokenStore.js';
import { participantShellRoutes } from '../test-utils/ambientRoutes.js';

/**
 * Reported bug: "participants cannot sign out — pressing Sign out leaves them signed in."
 *
 * Every layer underneath already passed, which is the point of this file. The API invalidates
 * the session row and clears the cookie; the component test presses the button and asserts that
 * `POST /api/auth/signout` was sent; the location-memory test asserts the trail is forgotten.
 * All three assert the CALL. None asserts the OUTCOME — that the person is afterwards signed
 * out and stays signed out.
 *
 * So the stub here is stateful the way the real server is: the session is alive until the
 * signout arrives and dead from then on. A fixed `200` route table cannot fail this test no
 * matter how broken sign-out is, which is exactly why the existing ones never caught it.
 */

let stub: FetchStub;

afterEach(() => {
  cleanup();
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
  clusters: [],
  topIndividuals: [],
  generatedAt: '2026-09-29T03:00:00.000Z',
};

/** The server's session row, as a value this test can kill. */
function liveServer(): RouteTable {
  let signedIn = true;
  return {
    'GET /api/auth/session': () =>
      signedIn
        ? { body: participantSession, delayMs: 10 }
        : { status: 401, body: { error: { message: messages.signInRequired } }, delayMs: 10 },
    'POST /api/auth/signout': () => {
      signedIn = false;
      return { body: { ok: true } };
    },
    'GET /api/me': { body: { participant: participantFixture, totals } },
    ...participantShellRoutes(),
    'GET /api/leaderboard': { body: leaderboard },
    'GET /api/me/scans': { body: { items: [], totals } },
  };
}

function renderAt(path: string) {
  return render(
    <TestRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </TestRouter>,
  );
}

describe('signing out', () => {
  it('leaves the participant signed OUT, not merely sends the request', async () => {
    const routes = liveServer();
    stub = installFetchStub(routes);
    // The token the sign-in wrote: the credential that has to stop working.
    writeSessionToken('live-session-token');

    renderAt('/me');

    await userEvent.click(await screen.findByTestId('profile__signout'));

    /*
     * The outcome: the front door, offering a way back IN, and the profile is gone. ADR-287 — the
     * front door and not the sign-in form: the form is where the guarded page bounced a session it
     * had just watched disappear, because the navigation away was still a pending transition.
     */
    expect(await screen.findByTestId('landing__signin')).toBeVisible();
    expect(screen.queryByTestId('signin-form__pin')).toBeNull();
    expect(screen.queryByTestId('profile__signout')).toBeNull();
    // ...and the credential is gone, so nothing can replay it.
    await waitFor(() => expect(window.localStorage.getItem('psd.sessionToken.v1')).toBeNull());
  });

  /*
   * The reported bug. The session cookie is HttpOnly (apps/api/src/lib/session.ts
   * `sessionCookieOptions`), so the only thing on earth that can revoke it is the server's
   * response to `POST /api/auth/signout`. When that request does not land, `endSession`
   * swallows the failure, clears the localStorage token, and reports success — but the cookie
   * is still on the device and the session row is still alive, and a cookie on its own is a
   * complete credential. The next page load presents it and the participant is signed straight
   * back in. The route table below models exactly that: the stub never checks the bearer token,
   * which is precisely how an ambient cookie behaves.
   */
  it('does not claim to have signed out when the server never confirmed it', async () => {
    const routes = liveServer();
    routes['POST /api/auth/signout'] = { offline: true };
    stub = installFetchStub(routes);
    writeSessionToken('live-session-token');

    renderAt('/me');
    await userEvent.click(await screen.findByTestId('profile__signout'));

    // Whatever it shows, it must not be a lie: the credential outlived the request, so the
    // participant is still signed in and has to be told so rather than walked to the exit.
    expect(await screen.findByTestId('profile__signout-failed')).toBeVisible();
    // And they are still standing on their profile: walking them to a page the surviving
    // cookie re-authenticates is what made this look like a button that does nothing.
    expect(screen.getByTestId('profile__signout')).toBeVisible();

    // And the proof that it would have been a lie: a reload puts them right back in.
    cleanup();
    renderAt('/me');
    expect(await screen.findByTestId('profile__signout')).toBeVisible();
  });

  /*
   * The second half of the same defect: every local `forget…` call sat AFTER the awaited
   * request, so a throw skipped all of them and left the previous participant's announcement
   * floor, feed marks and location trail on a borrowed phone.
   */
  it('forgets this phone\u2019s trail even when the request fails', async () => {
    const routes = liveServer();
    routes['POST /api/auth/signout'] = { offline: true };
    stub = installFetchStub(routes);
    writeSessionToken('live-session-token');
    writeLastPath('/board');

    renderAt('/me');
    await userEvent.click(await screen.findByTestId('profile__signout'));

    await waitFor(() => expect(readLastPath()).toBeNull());
  });

  it('stays signed out across the reload the participant does next', async () => {
    const routes = liveServer();
    stub = installFetchStub(routes);
    writeSessionToken('live-session-token');

    renderAt('/me');
    await userEvent.click(await screen.findByTestId('profile__signout'));
    expect(await screen.findByTestId('landing__signin')).toBeVisible();

    // A reload is a fresh mount against the same storage and the same (now dead) server.
    cleanup();
    renderAt('/me');

    expect(await screen.findByTestId('signin-form__pin')).toBeVisible();
    expect(screen.queryByTestId('profile__signout')).toBeNull();
  });
});
