import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messages } from '@psd/contracts';
import { FringeStationPage } from '../routes-facilitator/FringeStationPage.js';
import { SyncQueuePage } from '../routes-facilitator/SyncQueuePage.js';
import { readQueue } from '../lib/offline/scanQueue.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub } from '../test-utils/fetchStub.js';
import type { FetchStub, StubHandler } from '../test-utils/fetchStub.js';
import {
  activityFixture,
  facilitatorSession,
  participantFixture,
  scanFixture,
} from '../test-utils/fixtures.js';

/**
 * fds.md §6.5 — F27 scan a participant, including the offline and duplicate branches that
 * make the beach usable (DC-004).
 *
 * ADR-088 — the manual path is a 4-digit scan number resolved to a nickname and confirmed in
 * a dialog before the award. The lookup needs the link, but the award itself still queues
 * when the POST fails mid-flight: the facilitator saw the right name a moment ago, and
 * dropping a confirmed award would be worse than syncing it later.
 */

let stub: FetchStub;

beforeEach(() => localStorage.clear());
afterEach(() => stub?.restore());

function stubFor(scanHandler: StubHandler, lookupHandler?: StubHandler) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: facilitatorSession },
    'GET /api/fringe/activities/activity-1': { body: { activity: activityFixture } },
    'GET /api/fringe/rounds/round-1/scans': { body: { items: [] } },
    [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]:
      lookupHandler ?? { body: { participant: participantFixture } },
    'POST /api/fringe/scans': scanHandler,
  });
}

/** Types the 4 digits (the fourth submits, ADR-085) and presses through the name dialog. */
async function awardByNumber(scanNumber: string) {
  const user = userEvent.setup();
  await screen.findByTestId('fringe__number');
  await user.type(screen.getByTestId('fringe__number'), scanNumber);
  await screen.findByTestId('confirm-dialog__title');
  await user.click(screen.getByTestId('confirm-dialog__confirm'));
  return user;
}

function renderStation() {
  renderWithProviders(<FringeStationPage />, {
    path: '/staff/activity/activity-1',
    route: '/staff/activity/:activityId',
    withSync: true,
  });
}

describe('F27 — scan a participant (S27)', () => {
  it('awards the round points and confirms with the nickname', async () => {
    stubFor({ status: 201, body: { scan: scanFixture, duplicate: false } });
    renderStation();

    await awardByNumber(participantFixture.scanNumber);

    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent('✓ BeachBoss +15 pts');
    const [call] = stub.callsTo('POST /api/fringe/scans');
    expect(call?.body).toMatchObject({ nickname: 'BeachBoss', roundId: 'round-1' });
    expect((call?.body as { clientScanUuid: string }).clientScanUuid).toMatch(/[0-9a-f-]{36}/);
  });

  it('reports a second scan in the same round as a duplicate without awarding again', async () => {
    stubFor({ status: 200, body: { scan: scanFixture, duplicate: true } });
    renderStation();

    await awardByNumber(participantFixture.scanNumber);

    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent(
      messages.alreadyScannedThisRound,
    );
  });

  it('surfaces an unknown number with the FDS message, with no dialog to confirm', async () => {
    stubFor(
      { status: 201, body: { scan: scanFixture, duplicate: false } },
      { status: 404, body: { error: { message: messages.scanNumberNotFound } } },
    );
    renderStation();

    const user = userEvent.setup();
    await user.type(await screen.findByTestId('fringe__number'), participantFixture.scanNumber);

    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent(
      messages.scanNumberNotFound,
    );
    expect(screen.queryByTestId('confirm-dialog__title')).toBeNull();
    expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(0);
  });

  it('queues a confirmed award when the POST fails mid-flight, and says so', async () => {
    // The lookup succeeded and the name was confirmed; only the award POST hits dead air.
    stubFor({ offline: true });
    renderStation();

    await awardByNumber(participantFixture.scanNumber);

    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent(
      '✓ BeachBoss +15 pts (queued)',
    );
    const queued = readQueue();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      nickname: 'BeachBoss',
      roundId: 'round-1',
      activityName: 'Beach Volleyball Rally',
      pointValue: 15,
    });
  });

  it('drains the queue with the same idempotency key once the network returns (S32)', async () => {
    stubFor({ offline: true });
    renderStation();
    await awardByNumber(participantFixture.scanNumber);
    await screen.findByTestId('fringe__outcome');
    const queuedUuid = readQueue()[0]?.clientScanUuid;
    stub.restore();

    stub = installFetchStub({
      'GET /api/auth/session': { body: facilitatorSession },
      'POST /api/fringe/scans': { status: 200, body: { scan: scanFixture, duplicate: true } },
    });
    renderWithProviders(<SyncQueuePage />, { path: '/staff/sync', withSync: true });

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('sync__retry'));

    await waitFor(() => expect(readQueue()).toHaveLength(0));
    const [call] = stub.callsTo('POST /api/fringe/scans');
    expect((call?.body as { clientScanUuid: string }).clientScanUuid).toBe(queuedUuid);
  });
});
