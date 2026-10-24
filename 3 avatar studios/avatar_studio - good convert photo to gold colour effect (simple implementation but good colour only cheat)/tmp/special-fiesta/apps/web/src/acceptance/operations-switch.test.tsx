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
 * ADR-118 — S61, the operations switch.
 *
 * Two buttons an operator reaches for on a bad afternoon, which is exactly when nobody will be
 * reading the code. What these tests pin is therefore less about the happy path than about what
 * the console *claims*: that it never offers a restart the deployment cannot perform, and never
 * reports a pause that has not happened.
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
const stationOfflineOn = {
  state: { ...runningState.state, isStationOfflineEnabled: true, stationOfflineUpdatedAt: '2026-04-18T02:30:00.000Z' },
  canRestart: true,
};
const pausedState = {
  state: {
    isSocialPaused: true,
    updatedAt: '2026-04-18T02:00:00.000Z',
    updatedByUsername: 'superadmin',
    isStationOfflineEnabled: false,
    stationOfflineUpdatedAt: null,
  },
  canRestart: true,
};

function renderSystem(routes: RouteTable = {}) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: superadminSession },
    'GET /api/admin/service-state': { body: runningState },
    'POST /api/admin/service-state/pause-social': { body: { state: pausedState.state } },
    'POST /api/admin/service-state/resume-social': { body: { state: runningState.state } },
    'POST /api/admin/system/restart': { status: 202, body: { ok: true } },
    // The page now carries the hall screen's keys too (ADR-145); this test is about the
    // other two panels, so the list is simply empty.
    'GET /api/admin/screen-keys': { body: { items: [] } },
    'POST /api/admin/service-state/enable-station-offline': { body: { state: stationOfflineOn.state } },
    'POST /api/admin/service-state/disable-station-offline': { body: { state: runningState.state } },
    ...routes,
  });
  renderWithProviders(<SystemPage />, { path: '/admin/system' });
}

describe('S61 — the operations switch', () => {
  it('pauses chat and photos only after the operator confirms', async () => {
    renderSystem();
    const user = userEvent.setup();

    expect(await screen.findByTestId('system__social-state')).toHaveTextContent('Running');

    await user.click(screen.getByTestId('system__pause-social'));
    // Cancel first: the confirmation has to be a gate, not a speed bump that fires anyway.
    await user.click(screen.getByTestId('confirm-dialog__cancel'));
    expect(stub.callsTo('POST /api/admin/service-state/pause-social')).toHaveLength(0);

    await user.click(screen.getByTestId('system__pause-social'));
    expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent(
      messages.socialPausedConfirmation,
    );
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/service-state/pause-social')).toHaveLength(1),
    );
  });

  it('re-reads the state after pausing rather than assuming it worked', async () => {
    let reads = 0;
    renderSystem({
      'GET /api/admin/service-state': () => {
        reads += 1;
        return { body: reads === 1 ? runningState : pausedState };
      },
    });
    const user = userEvent.setup();

    await screen.findByTestId('system__pause-social');
    await user.click(screen.getByTestId('system__pause-social'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    // The panel flips because the server said so on the follow-up read, and it names who did
    // it — on a day with two superadmins, "who paused this" is the first question asked.
    expect(await screen.findByTestId('system__resume-social')).toBeInTheDocument();
    expect(screen.getByTestId('system__paused-by')).toHaveTextContent('superadmin');
    expect(screen.getByTestId('system__social-state')).toHaveTextContent('Paused');
  });

  it('offers resume — and only resume — while paused', async () => {
    renderSystem({ 'GET /api/admin/service-state': { body: pausedState } });
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('system__resume-social'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/service-state/resume-social')).toHaveLength(1),
    );
    expect(screen.queryByTestId('system__pause-social')).toBeNull();
  });

  it('explains the restart instead of offering it when nothing can restart this process', async () => {
    renderSystem({
      'GET /api/admin/service-state': { body: { ...runningState, canRestart: false } },
    });

    expect(await screen.findByTestId('system__restart-unavailable')).toHaveTextContent(
      messages.restartUnavailable,
    );
    // The point of the capability flag: no button to press, so no 503 to be surprised by.
    expect(screen.queryByTestId('system__restart')).toBeNull();
  });

  it('never shows an enabled restart button before the server has said it can', async () => {
    // A slow read is the realistic case — this is a laptop on event Wi-Fi. Assuming the
    // optimistic answer here would put an enabled restart in front of an operator for as long
    // as the read takes, on a deployment that may not honour it.
    renderSystem({ 'GET /api/admin/service-state': { body: runningState, delayMs: 20 } });

    expect(screen.getByTestId('system__loading')).toBeInTheDocument();
    expect(screen.queryByTestId('system__restart')).toBeNull();
    expect(await screen.findByTestId('system__restart')).toBeInTheDocument();
  });

  it('reports that it asked, because the 202 is the last thing that server will say', async () => {
    renderSystem();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('system__restart'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    expect(await screen.findByTestId('system__restart-asked')).toHaveTextContent(
      messages.restartScheduled,
    );
    // No second chance to press it: the process this page was talking to is on its way out.
    expect(screen.queryByTestId('system__restart')).toBeNull();
    expect(stub.callsTo('POST /api/admin/system/restart')).toHaveLength(1);
  });

  it('offers nothing to press when it could not read the state at all', async () => {
    renderSystem({
      'GET /api/admin/service-state': { status: 500, body: { error: { message: 'Boom.' } } },
    });

    expect(await screen.findByTestId('system__error')).toHaveTextContent('Boom.');
    // Neither panel appears. A console that does not know whether the event is paused must not
    // offer to pause it, and must not claim the restart is unavailable either.
    expect(screen.queryByTestId('system__pause-social')).toBeNull();
    expect(screen.queryByTestId('system__restart')).toBeNull();
    expect(screen.queryByTestId('system__restart-unavailable')).toBeNull();
  });

  it('surfaces a refused pause rather than silently doing nothing', async () => {
    renderSystem({
      'POST /api/admin/service-state/pause-social': {
        status: 403,
        body: { error: { message: 'Superadmin only.' } },
      },
    });
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('system__pause-social'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    expect(await screen.findByTestId('system__error')).toHaveTextContent('Superadmin only.');
    expect(screen.getByTestId('system__social-state')).toHaveTextContent('Running');
  });
});

/**
 * ADR-147 — the third switch. What these pin is the operator's side of a feature whose other
 * end is a service worker nobody in this repository can test: that it is off until somebody
 * says otherwise, that turning it on is a decision rather than a tap, and that the page tells
 * the truth about what turning it off does and does not reach.
 */
describe('S61 — station offline mode', () => {
  it('reports off, and turns on only after the operator confirms', async () => {
    renderSystem();
    const user = userEvent.setup();

    expect(await screen.findByTestId('system__station-offline-state')).toHaveTextContent('Off');

    await user.click(screen.getByTestId('system__enable-station-offline'));
    await user.click(screen.getByTestId('confirm-dialog__cancel'));
    expect(
      stub.callsTo('POST /api/admin/service-state/enable-station-offline'),
    ).toHaveLength(0);

    await user.click(screen.getByTestId('system__enable-station-offline'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));
    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/service-state/enable-station-offline')).toHaveLength(1),
    );
  });

  /* The off switch is the one that matters on a bad day, so it is the one with a test that
   * watches it be offered — and only it — once the mode is on. */
  it('offers only the off switch while it is on, and says when it last changed', async () => {
    renderSystem({ 'GET /api/admin/service-state': { body: stationOfflineOn } });
    const user = userEvent.setup();

    expect(await screen.findByTestId('system__station-offline-state')).toHaveTextContent('On');
    expect(screen.getByTestId('system__station-offline-at')).toHaveTextContent('Last changed');
    expect(screen.queryByTestId('system__enable-station-offline')).toBeNull();

    await user.click(screen.getByTestId('system__disable-station-offline'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));
    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/service-state/disable-station-offline')).toHaveLength(
        1,
      ),
    );
  });

  it('tells the operator the two things that are easy to get wrong', async () => {
    renderSystem();
    await screen.findByTestId('system__station-offline-state');
    const panel = screen.getByTestId('system__station-offline-state').closest('section');
    // Participants are never given a copy, and a phone with no signal keeps its copy: the
    // scope and the limit of the off switch, both on the page where the decision is made.
    expect(panel).toHaveTextContent('participants are never given a copy');
    expect(panel).toHaveTextContent('a phone with no signal keeps working from its copy');
  });
});
