import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyStates, messages } from '@psd/contracts';
import { StaffSignInPage } from './StaffSignInPage.js';
import { StaffHomePage } from './StaffHomePage.js';
import { PinResetPage } from './PinResetPage.js';
import { SyncQueuePage } from './SyncQueuePage.js';
import { AdminSignInPage } from '../routes-superadmin/AdminSignInPage.js';
import { renderWithProviders, confirmDialog } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import {
  activityFixture,
  courtFixture,
  facilitatorSession,
  participantFixture,
  superadminSession,
} from '../test-utils/fixtures.js';
import { enqueueScan, newClientScanUuid, readQueue } from '../lib/offline/scanQueue.js';
import { facilitatorShellRoutes } from '../test-utils/ambientRoutes.js';
import { expectEveryFieldDescribed } from '../test-utils/fieldHelpWalk.js';

/**
 * S18–S20, S32–S33 and S34 — the facilitator console and both staff sign-in surfaces
 * (F18–F21, F31–F33). Spartan chrome, big buttons, no avatars (fds.md §5.4).
 */

let stub: FetchStub;

afterEach(() => stub?.restore());

function render(
  ui: Parameters<typeof renderWithProviders>[0],
  routes: RouteTable,
  options?: { withSync?: boolean },
) {
  stub = installFetchStub({
    ...facilitatorShellRoutes(),
    'GET /api/auth/session': { status: 401, body: { error: { message: messages.signInRequired } } },
    ...routes,
  });
  return renderWithProviders(ui, { withSync: true, ...options });
}

describe('S18 — facilitator sign-in (F18)', () => {
  it('signs in with a username and 4-digit passcode', async () => {
    render(<StaffSignInPage />, {
      'POST /api/auth/facilitators/signin': { body: { facilitator: facilitatorSession.staff } },
    });
    const user = userEvent.setup();
    await user.type(screen.getByTestId('staff-signin__username'), 'fringe1');
    await user.type(screen.getByTestId('staff-signin__passcode'), '1111');
    await user.click(screen.getByTestId('staff-signin__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/facilitators/signin')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/facilitators/signin')[0]?.body).toEqual({
      username: 'fringe1',
      passcode: '1111',
    });
  });

  it('shows the generic rejection message and a way back to the landing page', async () => {
    render(<StaffSignInPage />, {
      'POST /api/auth/facilitators/signin': {
        status: 401,
        body: { error: { message: messages.credentialsRejected } },
      },
    });
    const user = userEvent.setup();
    await user.type(screen.getByTestId('staff-signin__username'), 'fringe1');
    await user.type(screen.getByTestId('staff-signin__passcode'), '9999');
    await user.click(screen.getByTestId('staff-signin__submit'));
    expect(await screen.findByTestId('staff-signin__error')).toHaveTextContent(
      messages.credentialsRejected,
    );
    expect(screen.getByTestId('staff-signin__back')).toHaveAttribute('href', '/');
  });
});

describe('S34 — superadmin sign-in (F19)', () => {
  it('signs in and rejects a wrong passcode with the same generic message', async () => {
    render(<AdminSignInPage />, {
      'POST /api/auth/superadmins/signin': { body: { superadmin: superadminSession.staff } },
    });
    const user = userEvent.setup();
    await user.type(screen.getByTestId('admin-signin__username'), 'superadmin');
    await user.type(screen.getByTestId('admin-signin__passcode'), '4242');
    await user.click(screen.getByTestId('admin-signin__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/superadmins/signin')).toHaveLength(1));

    // The surface stays mounted until the refreshed session confirms the cookie (ADR-015),
    // so the second attempt needs a clean document rather than a second form beside the first.
    stub.restore();
    cleanup();
    render(<AdminSignInPage />, {
      'POST /api/auth/superadmins/signin': {
        status: 401,
        body: { error: { message: messages.credentialsRejected } },
      },
    });
    const retry = userEvent.setup();
    await retry.type(screen.getByTestId('admin-signin__username'), 'superadmin');
    await retry.type(screen.getByTestId('admin-signin__passcode'), '0000');
    await retry.click(screen.getByTestId('admin-signin__submit'));
    expect(await screen.findByTestId('admin-signin__error')).toHaveTextContent(
      messages.credentialsRejected,
    );
  });
});

describe('S19/S20 — station picker (F20/F21)', () => {
  it('lists courts and activities, stars the default station and links to each console', async () => {
    stub = installFetchStub({
    ...facilitatorShellRoutes(),
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/tournament/dumb/status': { body: { active: false } },
      'GET /api/tournament/courts': { body: { items: [courtFixture] } },
      'GET /api/swag/stations': { body: { items: [] } },
      'GET /api/fringe/activities': { body: { items: [activityFixture] } },
    });
    renderWithProviders(<StaffHomePage />, { withSync: true });

    const stations = await screen.findAllByTestId('staff-home__station');
    expect(stations).toHaveLength(2);
    expect(stations[0]).toHaveAttribute('href', `/staff/court/${courtFixture.id}`);
    expect(stations[1]).toHaveAttribute('href', `/staff/activity/${activityFixture.id}`);
    expect(within(stations[1] as HTMLElement).getByText(/★/)).toBeVisible();
    expect(screen.getByText('Idle')).toBeVisible();
    expect(screen.getByText(/Round 1/)).toBeVisible();
  });

  it('marks a disabled court as unavailable and reports an empty event', async () => {
    stub = installFetchStub({
    ...facilitatorShellRoutes(),
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/tournament/dumb/status': { body: { active: false } },
      'GET /api/tournament/courts': {
        body: { items: [{ ...courtFixture, isEnabled: false, currentMatchId: 'match-1' }] },
      },
      'GET /api/swag/stations': { body: { items: [] } },
      'GET /api/fringe/activities': { body: { items: [] } },
    });
    renderWithProviders(<StaffHomePage />, { withSync: true });
    expect(await screen.findByText('Disabled')).toBeVisible();

    stub.restore();
    stub = installFetchStub({
    ...facilitatorShellRoutes(),
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/tournament/dumb/status': { body: { active: false } },
      'GET /api/tournament/courts': { body: { items: [] } },
      'GET /api/swag/stations': { body: { items: [] } },
      'GET /api/fringe/activities': { body: { items: [] } },
    });
    renderWithProviders(<StaffHomePage />, { withSync: true });
    expect(await screen.findByText(/No stations configured yet/)).toBeVisible();
  });
});

describe('ADR-336 §5.4 — asking from the station picker', () => {
  const pickerRoutes: RouteTable = {
    'GET /api/auth/session': { body: facilitatorSession },
    'GET /api/tournament/courts': { body: { items: [courtFixture] } },
    'GET /api/fringe/activities': { body: { items: [] } },
    'GET /api/swag/stations': { body: { items: [] } },
  };

  it('asks about the venue, not one court, and names the marshal who asked', async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      ...pickerRoutes,
      'POST /api/tournament/mode/requests': {
        status: 201,
        body: {
          mode: 'fixtures',
          isAwarding: false,
          pendingRequest: {
            id: 'req-1',
            requestedByLabel: 'fringe1',
            reason: 'The rain is not stopping.',
            courtLabel: null,
            createdAt: '2026-10-15T02:10:00.000Z',
          },
        },
      },
    });
    renderWithProviders(<StaffHomePage />, { withSync: true });
    const user = userEvent.setup();
    expect(await screen.findByTestId('mode-ask')).toBeVisible();
    await user.type(screen.getByTestId('mode-ask__reason'), 'The rain is not stopping.');
    await user.click(screen.getByTestId('mode-ask__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/tournament/mode/requests')).toHaveLength(1));
    // No court: the marshal is asking about the room, and a courtId of '' would name a court that is not there.
    expect(stub.callsTo('POST /api/tournament/mode/requests')[0]?.body).toEqual({
      reason: 'The rain is not stopping.',
      clientUuid: expect.any(String),
    });
    expect(await screen.findByTestId('mode-ask__pending')).toHaveTextContent('fringe1 asked to switch');
  });

  it('shows nothing to ask once the courts are awarding', async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      ...pickerRoutes,
      'GET /api/tournament/mode': {
        body: { mode: 'dumb', isAwarding: true, pendingRequest: null },
      },
    });
    renderWithProviders(<StaffHomePage />, { withSync: true });
    expect(await screen.findByText('Pick your station')).toBeVisible();
    expect(screen.queryByTestId('mode-ask')).toBeNull();
  });
});

describe('ADR-101 — staff sign-in invites the browser to save credentials', () => {
  it('marks the form and fields so password managers offer to autosave', () => {
    render(<StaffSignInPage />, {});
    expect(screen.getByTestId('staff-signin__form')).toHaveAttribute('autocomplete', 'on');
    expect(screen.getByTestId('staff-signin__username')).toHaveAttribute('name', 'username');
    expect(screen.getByTestId('staff-signin__username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByTestId('staff-signin__passcode')).toHaveAttribute('autocomplete', 'current-password');
  });
});

describe('S33 — PIN reset (F33)', () => {
  const nicknameRoute = `GET /api/staff/participants/by-nickname/${participantFixture.nickname}`;

  it('looks the participant up, then sets a new PIN', async () => {
    render(<PinResetPage />, {
      'GET /api/auth/session': { body: facilitatorSession },
      [nicknameRoute]: { body: { participant: participantFixture } },
      [`PUT /api/staff/participants/${participantFixture.id}/pin`]: {
        body: { participant: participantFixture },
      },
    });
    const user = userEvent.setup();
    await user.type(screen.getByTestId('pin-reset__nickname'), participantFixture.nickname);
    await user.click(screen.getByTestId('pin-reset__lookup'));

    await screen.findByTestId('pin-reset__new-pin');
    await user.type(screen.getByTestId('pin-reset__new-pin'), '2468');
    await user.click(screen.getByTestId('pin-reset__submit'));
    // ADR-027 — the old PIN stops working, so the facilitator confirms first.
    expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent('old PIN stops working');
    await confirmDialog(user);

    await waitFor(() =>
      expect(stub.callsTo(`PUT /api/staff/participants/${participantFixture.id}/pin`)).toHaveLength(1),
    );
    expect(await screen.findByTestId('pin-reset__confirmation')).toHaveTextContent(
      `PIN reset for ${participantFixture.nickname}`,
    );
  });

  it('refuses a PIN that is not four digits before calling the API', async () => {
    render(<PinResetPage />, {
      'GET /api/auth/session': { body: facilitatorSession },
      [nicknameRoute]: { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();
    await user.type(screen.getByTestId('pin-reset__nickname'), participantFixture.nickname);
    await user.click(screen.getByTestId('pin-reset__lookup'));
    await screen.findByTestId('pin-reset__new-pin');
    await user.type(screen.getByTestId('pin-reset__new-pin'), '24');
    await user.click(screen.getByTestId('pin-reset__submit'));

    expect(await screen.findByTestId('pin-reset__error')).toHaveTextContent(messages.pinInvalid);
    expect(stub.calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
  });

  it('reports an unknown nickname with the FDS copy', async () => {
    render(<PinResetPage />, {
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/staff/participants/by-nickname/Nobody': {
        status: 404,
        body: { error: { message: messages.nicknameNotFound } },
      },
    });
    const user = userEvent.setup();
    await user.type(screen.getByTestId('pin-reset__nickname'), 'Nobody');
    await user.click(screen.getByTestId('pin-reset__lookup'));
    expect(await screen.findByTestId('pin-reset__error')).toHaveTextContent(
      messages.nicknameNotFound,
    );
    expect(screen.queryByTestId('pin-reset__new-pin')).toBeNull();
  });

  it('suggests matches while typing and fills the reset from a tapped row (ADR-101)', async () => {
    render(<PinResetPage />, {
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/staff/participants': {
        body: { items: [{ participant: participantFixture, teamName: 'Sandstorm' }] },
      },
    });
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId('pin-reset__nickname'),
      participantFixture.nickname.slice(0, 2),
    );

    // A big tappable row: nickname plus enough context to pick the right person.
    const row = await screen.findByTestId('pin-reset__suggestion');
    expect(row).toHaveTextContent(participantFixture.nickname);
    expect(row).toHaveTextContent('Sandstorm');

    await user.click(row);

    // The row carried the whole participant — straight to the PIN form, droplist gone,
    // and no by-nickname round trip was needed.
    expect(await screen.findByTestId('pin-reset__new-pin')).toBeVisible();
    expect(screen.queryByTestId('pin-reset__suggestions')).toBeNull();
    expect(stub.calls.filter((call) => call.path.includes('by-nickname'))).toHaveLength(0);
  });

  it('routes typing from anywhere into the step you are on (ADR-105)', async () => {
    render(<PinResetPage />, {
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/staff/participants': {
        body: { items: [{ participant: participantFixture, teamName: null }] },
      },
    });

    // Step one: the nickname field is the primary box.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    expect(screen.getByTestId('pin-reset__nickname')).toHaveFocus();

    // Find somebody via the combobox; the primary box becomes the new-PIN field.
    const user = userEvent.setup();
    await user.type(screen.getByTestId('pin-reset__nickname'), 'Be');
    await user.click(await screen.findByTestId('pin-reset__suggestion'));
    await screen.findByTestId('pin-reset__new-pin');

    (document.activeElement as HTMLElement | null)?.blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(screen.getByTestId('pin-reset__new-pin')).toHaveFocus();
  });

  it('asks the directory nothing until two characters are typed (ADR-101)', async () => {
    render(<PinResetPage />, {
      'GET /api/auth/session': { body: facilitatorSession },
    });
    await userEvent.setup().type(screen.getByTestId('pin-reset__nickname'), 'W');

    expect(stub.callsTo('GET /api/staff/participants')).toHaveLength(0);
    expect(screen.queryByTestId('pin-reset__suggestions')).toBeNull();
  });
});

describe('S32 — offline sync queue (F27/F51)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function queueOne() {
    enqueueScan({
      clientScanUuid: newClientScanUuid(),
      nickname: participantFixture.nickname,
      roundId: 'round-1',
      tierLabel: 'Award',
      activityName: activityFixture.activityName,
      pointValue: 15,
      clientTimestamp: new Date('2026-09-29T02:20:00.000Z').toISOString(),
    });
  }

  it('shows the FDS empty-state copy when nothing is waiting', async () => {
    render(<SyncQueuePage />, { 'GET /api/auth/session': { body: facilitatorSession } });
    expect(await screen.findByText(emptyStates.syncQueue)).toBeVisible();
    expect(screen.getByTestId('sync__status')).toHaveTextContent('0 waiting');
    expect(screen.getByTestId('sync__retry')).toBeDisabled();
  });

  it('shows the offline banner and count when the connection drops', async () => {
    queueOne();
    render(<SyncQueuePage />, { 'GET /api/auth/session': { body: facilitatorSession } });
    expect(await screen.findByTestId('sync__status')).toHaveTextContent('Online · 1 waiting');
    expect(screen.getByText(/Online · 1 queued/)).toBeVisible();

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('sync__status')).toHaveTextContent('Offline · 1 waiting'),
    );
    expect(screen.getByText(/Offline · 1 queued/)).toBeVisible();
  });

  it('drains a queued scan when the facilitator taps Sync now', async () => {
    queueOne();
    render(
      <SyncQueuePage />,
      {
        'GET /api/auth/session': { body: facilitatorSession },
        'POST /api/fringe/scans': { status: 201, body: { scan: {}, duplicate: false } },
      },
    );
    expect(await screen.findByTestId('sync__row')).toHaveTextContent(participantFixture.nickname);
    await userEvent.setup().click(screen.getByTestId('sync__retry'));
    await waitFor(() => expect(readQueue()).toHaveLength(0));
  });

  it('keeps a rejected scan visible with its reason, and can discard it', async () => {
    queueOne();
    render(
      <SyncQueuePage />,
      {
        'GET /api/auth/session': { body: facilitatorSession },
        'POST /api/fringe/scans': {
          status: 404,
          body: { error: { message: messages.roundNotFound } },
        },
      },
    );
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('sync__retry'));
    await waitFor(() => expect(screen.getByTestId('sync__row')).toHaveTextContent('1×'));
    expect(readQueue()).toHaveLength(1);

    await user.click(screen.getByTestId('sync__discard'));
    await waitFor(() => expect(readQueue()).toHaveLength(0));
  });

  it('reports an offline drain and leaves the queue in place', async () => {
    queueOne();
    render(
      <SyncQueuePage />,
      {
        'GET /api/auth/session': { body: facilitatorSession },
        'POST /api/fringe/scans': { offline: true },
      },
    );
    await userEvent.setup().click(await screen.findByTestId('sync__retry'));
    expect(await screen.findByTestId('sync__error')).toHaveTextContent(/Can't reach Active Day/);
    expect(readQueue()).toHaveLength(1);
  });
});

describe('Every facilitator field carries its help (ADR-322)', () => {
  it('the PIN reset fields, find and set', async () => {
    render(<PinResetPage />, {
      'GET /api/auth/session': { body: facilitatorSession },
      [`GET /api/staff/participants/by-nickname/${participantFixture.nickname}`]: { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();
    expectEveryFieldDescribed(document.body, 1);
    await user.type(screen.getByTestId('pin-reset__nickname'), participantFixture.nickname);
    await user.click(screen.getByTestId('pin-reset__lookup'));
    await screen.findByTestId('pin-reset__new-pin');
    expectEveryFieldDescribed(document.body, 2);
  });

  it('the staff sign-in fields', async () => {
    render(<StaffSignInPage />, {});
    await screen.findByTestId('staff-signin__username');
    expectEveryFieldDescribed(document.body, 2);
  });
});
