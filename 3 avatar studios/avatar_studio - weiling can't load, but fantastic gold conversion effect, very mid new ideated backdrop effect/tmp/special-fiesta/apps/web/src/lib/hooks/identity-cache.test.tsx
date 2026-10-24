import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import type { SessionView } from '@psd/contracts';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { participantFixture, participantSession, teamFixture } from '../../test-utils/fixtures.js';
import { renderWithProviders } from '../../test-utils/renderWithProviders.js';
import { SessionContext, useSession } from '../session/context.js';
import type { SessionState } from '../session/context.js';
import {
  forgetRememberedSession,
  readRememberedSession,
  rememberSession,
} from '../session/sessionCache.js';
import { clearSessionToken, writeSessionToken } from '../session/tokenStore.js';
import { readCached } from '../storage/cacheStore.js';
import { MY_TEAM_CACHE } from '../storage/cacheNames.js';
import { useMyTeam } from './useTeams.js';
import { useProfile } from './useParticipantHome.js';

/**
 * ADR-112 step 3 — the identity reads, which are the ones a participant pays for over and
 * over: `/api/teams/mine` is mounted by four surfaces, `/api/me` by two, and the session
 * by every single page load.
 *
 * What is worth pinning here is the DIFFERENCE between the three policies, because they
 * look alike in the code and are not alike at all:
 *
 *   - the roster may be served without asking (a TTL skip — the only true traffic cut);
 *   - the profile is served for its short identity TTL, then refreshed on the next eligible read;
 *   - the session may be painted without asking and must always ask (it is an auth answer).
 *
 * A test that only checked "the cached value showed up" would pass for all three while the
 * last two quietly stopped revalidating, which is the failure that matters.
 */

let stub: FetchStub;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  stub?.restore();
  window.localStorage.clear();
});

function signedIn(session: SessionView = participantSession) {
  const state: SessionState = {
    session,
    isLoading: false,
    refresh: () => Promise.resolve(session),
    endSession: () => Promise.resolve(true),
  };
  return ({ children }: { children: ReactNode }) =>
    createElement(SessionContext.Provider, { value: state }, children);
}

describe('/api/teams/mine on the device (ADR-112)', () => {
  it('serves the second mount with no request at all — the actual traffic cut', async () => {
    stub = installFetchStub({ 'GET /api/teams/mine': { body: { team: teamFixture } } });
    const wrapper = signedIn();

    const first = renderHook(() => useMyTeam(), { wrapper });
    await waitFor(() => expect(first.result.current.team?.teamName).toBe('Sandstorm'));
    expect(stub.callsTo('GET /api/teams/mine')).toHaveLength(1);
    first.unmount();

    // A tab hop: Teams → Profile → My Team, all within the minute.
    const second = renderHook(() => useMyTeam(), { wrapper });
    // Not "eventually" — the roster is there on the very first frame.
    expect(second.result.current.team?.teamName).toBe('Sandstorm');
    await act(() => Promise.resolve());
    expect(stub.callsTo('GET /api/teams/mine')).toHaveLength(1);
  });

  it('never serves a roster the viewer just changed', async () => {
    stub = installFetchStub({
      'GET /api/teams/mine': { body: { team: teamFixture } },
      'DELETE /api/teams/team-a/members/participant-2': { body: { team: teamFixture } },
    });
    const wrapper = signedIn();
    const { result, unmount } = renderHook(() => useMyTeam(), { wrapper });
    await waitFor(() => expect(result.current.team?.teamName).toBe('Sandstorm'));

    await act(async () => {
      result.current.kick('participant-2');
    });
    await waitFor(() =>
      expect(stub.callsTo('DELETE /api/teams/team-a/members/participant-2')).toHaveLength(1),
    );
    unmount();

    // The kick dropped the remembered roster, so the next surface asks again rather than
    // painting the member who is no longer on the team.
    const after = renderHook(() => useMyTeam(), { wrapper });
    await waitFor(() => expect(stub.callsTo('GET /api/teams/mine').length).toBeGreaterThan(1));
    after.unmount();
  });

  it('keeps one participant\'s roster away from the next one on a shared phone', async () => {
    stub = installFetchStub({ 'GET /api/teams/mine': { body: { team: teamFixture } } });
    const { result, unmount } = renderHook(() => useMyTeam(), { wrapper: signedIn() });
    await waitFor(() => expect(result.current.team?.teamName).toBe('Sandstorm'));
    expect(readCached(MY_TEAM_CACHE, participantFixture.id, 60_000)).not.toBeNull();
    unmount();

    clearSessionToken();

    expect(readCached(MY_TEAM_CACHE, participantFixture.id, 60_000)).toBeNull();
  });
});

describe('/api/me on the device (ADR-112)', () => {
  it('paints the remembered card but still asks, because it carries live points', async () => {
    stub = installFetchStub({
      'GET /api/me': {
        body: { participant: participantFixture, totals: stubTotals(40) },
      },
    });
    const wrapper = signedIn();

    const first = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(first.result.current.totals?.totalPoints).toBe(40));
    first.unmount();

    // Somebody scanned them in between: the server now says 55.
    stub.routes['GET /api/me'] = {
      body: { participant: participantFixture, totals: stubTotals(55) },
      delayMs: 5,
    };

    const second = renderHook(() => useProfile(), { wrapper });
    // The old number paints instantly — no spinner on a page the viewer opens all day…
    expect(second.result.current.totals?.totalPoints).toBe(40);
    expect(second.result.current.isLoading).toBe(false);
    // …and is corrected, because a stale score is the one thing this page may not show.
    await waitFor(() => expect(second.result.current.totals?.totalPoints).toBe(55));
    expect(stub.callsTo('GET /api/me')).toHaveLength(2);
    second.unmount();
  });
});

function stubTotals(totalPoints: number) {
  return { totalPoints, fringePoints: totalPoints, tournamentPoints: 0, scanCount: 3 };
}

describe('the warm session boot (ADR-112)', () => {
  it('opens on the remembered identity instead of a spinner, and revalidates underneath', async () => {
    writeSessionToken('token-from-this-morning');
    rememberSession(participantSession);
    stub = installFetchStub({
      'GET /api/auth/session': { status: 200, body: participantSession, delayMs: 20 },
    });

    renderWithProviders(createElement(WhoAmI));

    // Before the server has said a word, the app already knows whose phone this is.
    expect(screen.getByTestId('who').textContent).toBe('BeachBoss');
    // And the check still goes out every boot — this defers an auth answer, never skips it.
    await waitFor(() => expect(stub.callsTo('GET /api/auth/session')).toHaveLength(1));
  });

  it('refuses to warm-start without a credential to back the claim up', () => {
    rememberSession(participantSession);
    // No token: whatever this device remembers, it cannot prove it any more.
    expect(readRememberedSession()).not.toBeNull();
    stub = installFetchStub({
      'GET /api/auth/session': { status: 401, body: { error: { message: 'no' } } },
    });

    renderWithProviders(createElement(WhoAmI));

    expect(screen.getByTestId('who').textContent).toBe('loading');
  });

  it('forgets the name when the session ends', () => {
    writeSessionToken('token-from-this-morning');
    rememberSession(participantSession);

    clearSessionToken();

    expect(readRememberedSession()).toBeNull();
  });

  it('forgets the name when a different person signs in on the same phone', () => {
    writeSessionToken('token-a');
    rememberSession(participantSession);

    writeSessionToken('token-b');

    expect(readRememberedSession()).toBeNull();
  });

  it('forgets on request, leaving nothing to warm-start from', () => {
    rememberSession(participantSession);
    expect(readRememberedSession()).not.toBeNull();

    forgetRememberedSession();

    expect(readRememberedSession()).toBeNull();
  });

  /*
   * The two ways a remembered identity can be unusable. Both must answer "nobody" rather
   * than throw: this is read during the FIRST RENDER of the whole app, so anything that
   * escapes here is a white screen on boot — the one failure a returning participant
   * cannot work around.
   */
  it('discards a remembered shape from before a contract change instead of migrating it', () => {
    // A SessionView that predates `actorType` — the field every consumer branches on.
    window.localStorage.setItem(
      'psd.session.v1',
      JSON.stringify({ participant: participantFixture }),
    );

    expect(readRememberedSession()).toBeNull();
  });

  it('survives a remembered value that is not JSON at all', () => {
    // Storage shared with other tabs and other apps; truncated writes happen.
    window.localStorage.setItem('psd.session.v1', '{"actorType":"partici');

    expect(readRememberedSession()).toBeNull();
  });

  it('boots to a spinner rather than a crash when the remembered value is corrupt', () => {
    writeSessionToken('token-from-this-morning');
    window.localStorage.setItem('psd.session.v1', 'not json');
    stub = installFetchStub({
      'GET /api/auth/session': { status: 200, body: participantSession, delayMs: 20 },
    });

    renderWithProviders(createElement(WhoAmI));

    expect(screen.getByTestId('who').textContent).toBe('loading');
  });
});

/** A one-line surface that reports who the real provider thinks is looking. */
function WhoAmI() {
  const { session, isLoading } = useSession();
  return createElement(
    'p',
    { 'data-testid': 'who' },
    isLoading ? 'loading' : (session?.participant?.nickname ?? 'nobody'),
  );
}
