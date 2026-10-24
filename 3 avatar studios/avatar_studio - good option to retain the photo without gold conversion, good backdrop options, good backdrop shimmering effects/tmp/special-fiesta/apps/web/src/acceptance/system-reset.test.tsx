import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messages } from '@psd/contracts';
import { SystemPage } from '../routes-superadmin/SystemPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub } from '../test-utils/fetchStub.js';
import type { FetchStub, RouteTable } from '../test-utils/fetchStub.js';
import { superadminSession } from '../test-utils/fixtures.js';

/**
 * ADR-307 — the danger zone on Operations.
 *
 * What these pin is the shape of the guard as the operator meets it: nothing is
 * fetched and nothing can be submitted until the red button is pressed on
 * purpose; the confirmation on screen is the server's string, not one the page
 * made up; and a refusal puts the spent challenge away rather than offering a
 * retry against it.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

const runningState = {
  state: {
    isSocialPaused: false,
    updatedAt: null,
    updatedByUsername: null,
    isStationOfflineEnabled: false,
    stationOfflineUpdatedAt: null,
  },
  canRestart: true,
};

const resetCounts = {
  resetAt: '2026-10-18T01:00:00.000Z',
  participants: 12,
  teams: 3,
  chatMessages: 40,
  teamChatMessages: 9,
  announcements: 1,
  photos: 5,
  tournaments: 1,
  matches: 6,
  fringeRounds: 2,
  swagRounds: 1,
  sessionsEnded: 14,
};

function renderSystem(routes: RouteTable = {}) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: superadminSession },
    'GET /api/admin/service-state': { body: runningState },
    'GET /api/admin/screen-keys': { body: { items: [] } },
    'POST /api/admin/system/reset/challenge': {
      body: { confirmation: 'DELETEaB3dEf7HiJ', expiresAt: '2026-10-18T01:05:00.000Z' },
    },
    'POST /api/admin/system/reset': { body: { reset: resetCounts } },
    ...routes,
  });
  renderWithProviders(<SystemPage />, { path: '/admin/system' });
}

describe('ADR-307 — the reset danger zone', () => {
  it('warns in red and asks for nothing until the button is pressed on purpose', async () => {
    renderSystem();

    const panel = await screen.findByTestId('system__reset-panel');
    expect(panel.className).toContain('console-panel--danger-zone');
    expect(screen.getByTestId('system__reset-warning')).toHaveTextContent('cannot be undone');
    expect(screen.getByTestId('system__reset-begin')).toHaveTextContent(
      'Reset users, teams, socials, tournaments and matches',
    );
    // No challenge is minted, and no form exists, before the deliberate press.
    expect(stub.callsTo('POST /api/admin/system/reset/challenge')).toHaveLength(0);
    expect(screen.queryByTestId('system__reset-passcode')).toBeNull();
  });

  it('shows the server challenge and submits only both proofs together', async () => {
    renderSystem();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('system__reset-begin'));
    expect(await screen.findByTestId('system__reset-challenge')).toHaveTextContent(
      'DELETEaB3dEf7HiJ',
    );
    expect(stub.callsTo('POST /api/admin/system/reset/challenge')).toHaveLength(1);

    const submit = screen.getByTestId('system__reset-submit');
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId('system__reset-passcode'), '4242');
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId('system__reset-confirmation'), 'DELETEaB3dEf7HiJ');
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/system/reset')).toHaveLength(1),
    );
    expect(stub.callsTo('POST /api/admin/system/reset')[0]?.body).toEqual({
      passcode: '4242',
      confirmation: 'DELETEaB3dEf7HiJ',
    });

    const result = await screen.findByTestId('system__reset-result');
    expect(result).toHaveTextContent(messages.resetDone);
    expect(result).toHaveTextContent('Participants deleted: 12');
    expect(result).toHaveTextContent('Tournaments deleted: 1 (6 matches)');
  });

  it('lets the operator back away without spending anything', async () => {
    renderSystem();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('system__reset-begin'));
    await screen.findByTestId('system__reset-challenge');
    await user.click(screen.getByTestId('system__reset-cancel'));

    expect(screen.queryByTestId('system__reset-passcode')).toBeNull();
    expect(stub.callsTo('POST /api/admin/system/reset')).toHaveLength(0);
    expect(screen.getByTestId('system__reset-begin')).toBeInTheDocument();
  });

  it('reports a refusal and retires the spent challenge instead of retrying it', async () => {
    renderSystem({
      'POST /api/admin/system/reset': {
        status: 403,
        body: { error: { message: messages.resetPasscodeRejected } },
      },
    });
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('system__reset-begin'));
    await user.type(await screen.findByTestId('system__reset-passcode'), '9999');
    await user.type(screen.getByTestId('system__reset-confirmation'), 'DELETEaB3dEf7HiJ');
    await user.click(screen.getByTestId('system__reset-submit'));

    expect(await screen.findByTestId('system__reset-error')).toHaveTextContent(
      messages.resetPasscodeRejected,
    );
    // The form is gone: the challenge was spent, and beginning again mints a new one.
    expect(screen.queryByTestId('system__reset-submit')).toBeNull();
    expect(screen.getByTestId('system__reset-begin')).toBeInTheDocument();
  });
});
