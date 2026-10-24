import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SwagRoundView, SwagStationView } from '@psd/contracts';
import { SwagStationPage } from './SwagStationPage.js';
import { renderWithProviders, confirmDialog } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { facilitatorSession, participantFixture } from '../test-utils/fixtures.js';

/**
 * ADR-110 — the swag counter console: open a round, arm an item, identify by number,
 * confirm by name, and surface the allowance refusal as an outcome line.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

const round: SwagRoundView = {
  id: 'round-1',
  stationId: 'station-1',
  roundNumber: 1,
  status: 'open',
  openedAt: '2026-10-01T01:00:00.000Z',
  closedAt: null,
  openedByUsername: 'fringe1',
  claimCount: 2,
};

const station: SwagStationView = {
  id: 'station-1',
  stationName: 'Goodie Bag Counter',
  items: [
    { label: 'Tote bag', limit: 1 },
    { label: 'Sticker pack', limit: 2 },
  ],
  isActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  currentRound: round,
};

function renderStation(routes: RouteTable) {
  stub = installFetchStub({ 'GET /api/auth/session': { body: facilitatorSession }, ...routes });
  return renderWithProviders(<SwagStationPage />, {
    path: '/staff/swag/station-1',
    route: '/staff/swag/:stationId',
    withSync: true,
  });
}

const liveStation: RouteTable = {
  'GET /api/swag/stations/station-1': { body: { station } },
  'GET /api/swag/rounds/round-1/claims': { body: { items: [] } },
};

describe('the swag counter console (ADR-110)', () => {
  it('opens a round when none is open', async () => {
    renderStation({
      'GET /api/swag/stations/station-1': { body: { station: { ...station, currentRound: null } } },
      'POST /api/swag/stations/station-1/rounds': { status: 201, body: { round } },
    });
    await userEvent.setup().click(await screen.findByTestId('swag__open'));
    await waitFor(() =>
      expect(stub.callsTo('POST /api/swag/stations/station-1/rounds')).toHaveLength(1),
    );
  });

  it('arms an item sticky-style and claims by typed number through the confirm', async () => {
    renderStation({
      ...liveStation,
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        body: { participant: participantFixture },
      },
      'POST /api/swag/claims': {
        status: 201,
        body: {
          claim: {
            id: 'claim-1',
            participantId: participantFixture.id,
            participantNickname: participantFixture.nickname,
            clusterCode: 'BP',
            stationNameSnapshot: station.stationName,
            roundNumberSnapshot: 1,
            itemLabelSnapshot: 'Sticker pack',
            facilitatorUsernameSnapshot: 'fringe1',
            claimedAt: '2026-10-01T01:05:00.000Z',
          },
          duplicate: false,
        },
      },
    });
    const user = userEvent.setup();

    // Arm the second item; the echo line says what the next handout will be (ADR-092).
    const items = within(await screen.findByTestId('swag__items')).getAllByTestId('swag__item');
    await user.click(items[1] as HTMLElement);
    expect(screen.getByTestId('swag__armed')).toHaveTextContent('Sticker pack');

    await user.type(screen.getByTestId('swag__number'), participantFixture.scanNumber);
    // The fourth digit IS the lookup; the dialog names the item and the person.
    await waitFor(() =>
      expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent('Limit 2 per person'),
    );
    await confirmDialog(user);

    await waitFor(() => expect(stub.callsTo('POST /api/swag/claims')).toHaveLength(1));
    expect(stub.callsTo('POST /api/swag/claims')[0]?.body).toMatchObject({
      nickname: participantFixture.nickname,
      roundId: 'round-1',
      itemLabel: 'Sticker pack',
    });
    expect(await screen.findByTestId('swag__outcome')).toHaveTextContent(
      `Sticker pack → ${participantFixture.nickname}`,
    );
  });

  it('advances and ends the round from the controls', async () => {
    renderStation({
      ...liveStation,
      'POST /api/swag/rounds/round-1/advance': { status: 201, body: { round: { ...round, id: 'round-2', roundNumber: 2 } } },
      'POST /api/swag/rounds/round-1/end': { body: { round: { ...round, status: 'ended' } } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('swag__advance'));
    await waitFor(() => expect(stub.callsTo('POST /api/swag/rounds/round-1/advance')).toHaveLength(1));
    await user.click(screen.getByTestId('swag__end'));
    await waitFor(() => expect(stub.callsTo('POST /api/swag/rounds/round-1/end')).toHaveLength(1));
  });

  it('reports a replayed claim as already recorded, and an unknown number quietly stops', async () => {
    const singleItem = { ...station, items: [{ label: 'Tote bag', limit: 1 }] };
    renderStation({
      'GET /api/swag/stations/station-1': { body: { station: singleItem } },
      'GET /api/swag/rounds/round-1/claims': { body: { items: [] } },
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        body: { participant: participantFixture },
      },
      'GET /api/staff/participants/by-number/9999': {
        status: 404,
        body: { error: { message: 'No participant holds that number.' } },
      },
      'POST /api/swag/claims': { body: { claim: {}, duplicate: true } },
    });
    const user = userEvent.setup();
    // A single-item station shows no arming row — nothing to choose between.
    await screen.findByTestId('swag__armed');
    expect(screen.queryByTestId('swag__items')).toBeNull();

    // Unknown number: the lookup refuses, no dialog, no claim.
    await user.type(screen.getByTestId('swag__number'), '9999');
    await waitFor(() => expect(screen.getByTestId('swag__error')).toBeVisible());
    expect(stub.callsTo('POST /api/swag/claims')).toHaveLength(0);

    await user.clear(screen.getByTestId('swag__number'));
    await user.type(screen.getByTestId('swag__number'), participantFixture.scanNumber);
    await waitFor(() => expect(screen.getByTestId('confirm-dialog__body')).toBeVisible());
    await confirmDialog(user);
    expect(await screen.findByTestId('swag__outcome')).toHaveTextContent('Already recorded');
  });

  it('starts and stops the camera when one is available', async () => {
    const original = navigator.mediaDevices;
    const track = { stop: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
    });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    renderStation(liveStation);
    const user = userEvent.setup();
    const toggle = await screen.findByTestId('swag__camera-start');
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveTextContent('Stop camera'));
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveTextContent('Start camera'));
    expect(track.stop).toHaveBeenCalled();

    HTMLMediaElement.prototype.play = play;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: original });
  });

  it('surfaces the allowance refusal as the outcome line', async () => {
    renderStation({
      ...liveStation,
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        body: { participant: participantFixture },
      },
      'POST /api/swag/claims': {
        status: 409,
        body: { error: { message: 'They have already claimed their limit of that item this round.' } },
      },
    });
    const user = userEvent.setup();
    await screen.findByTestId('swag__number');
    await user.type(screen.getByTestId('swag__number'), participantFixture.scanNumber);
    await waitFor(() => expect(screen.getByTestId('confirm-dialog__body')).toBeVisible());
    await confirmDialog(user);

    expect(await screen.findByTestId('swag__outcome')).toHaveTextContent('already claimed their limit');
  });
});

/**
 * ADR-159 — the counter's ten-second take-back.
 *
 * The button is the easy part; the guarantees worth testing are that it only ever points at
 * the handout on screen, and that a reversed handout stays visible on the round list instead
 * of quietly vanishing.
 */
describe('taking a handout back at the counter (ADR-159)', () => {
  const claim = {
    id: 'claim-1',
    participantId: participantFixture.id,
    participantNickname: participantFixture.nickname,
    clusterCode: 'BP',
    stationId: 'station-1',
    stationNameSnapshot: station.stationName,
    roundNumberSnapshot: 1,
    itemLabelSnapshot: 'Tote bag',
    facilitatorUsernameSnapshot: 'fringe1',
    claimedAt: '2026-10-01T01:05:00.000Z',
    isVoided: false,
    undoneAt: null,
  };

  async function handOut(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByTestId('swag__number'), participantFixture.scanNumber);
    await waitFor(() => expect(screen.getByTestId('confirm-dialog__body')).toBeInTheDocument());
    await confirmDialog(user);
    await waitFor(() => expect(stub.callsTo('POST /api/swag/claims')).toHaveLength(1));
  }

  it('offers the undo after a handout and takes it back on the server', async () => {
    renderStation({
      ...liveStation,
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        body: { participant: participantFixture },
      },
      'POST /api/swag/claims': { status: 201, body: { claim, duplicate: false } },
      'POST /api/swag/claims/claim-1/undo': {
        body: { claim: { ...claim, isVoided: true, undoneAt: '2026-10-01T01:05:05.000Z' } },
      },
    });
    const user = userEvent.setup();
    await screen.findByTestId('swag__items');
    await handOut(user);

    await user.click(await screen.findByTestId('swag__undo'));
    await waitFor(() => expect(stub.callsTo('POST /api/swag/claims/claim-1/undo')).toHaveLength(1));
    /*
     * The allowance is the point of the message. "Voided" would be true and useless — what
     * the counter needs to know is that they can now hand one to the right person.
     */
    expect(await screen.findByTestId('swag__outcome')).toHaveTextContent('allowance is free');
  });

  it('offers no undo for a replayed handout, which consumed nothing to take back', async () => {
    renderStation({
      ...liveStation,
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        body: { participant: participantFixture },
      },
      'POST /api/swag/claims': { status: 200, body: { claim, duplicate: true } },
    });
    const user = userEvent.setup();
    await screen.findByTestId('swag__items');
    await handOut(user);

    expect(await screen.findByTestId('swag__outcome')).toHaveTextContent('Already recorded');
    expect(screen.queryByTestId('swag__undo')).toBeNull();
  });

  /*
   * ADR-138's rule, inherited: the countdown is decoration and the server owns the window,
   * so the button must be refusable on the last tick and must say so in words rather than
   * leaving the counter believing the handout was taken back.
   */
  it('reports a refusal in words when the window has already closed server-side', async () => {
    renderStation({
      ...liveStation,
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        body: { participant: participantFixture },
      },
      'POST /api/swag/claims': { status: 201, body: { claim, duplicate: false } },
      'POST /api/swag/claims/claim-1/undo': {
        status: 409,
        body: { error: { message: 'Too late to undo that one — a superadmin can still void it.' } },
      },
    });
    const user = userEvent.setup();
    await screen.findByTestId('swag__items');
    await handOut(user);

    await user.click(await screen.findByTestId('swag__undo'));
    expect(await screen.findByTestId('swag__outcome')).toHaveTextContent('Too late to undo');
  });

  it('takes the button away once the window has run out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderStation({
        ...liveStation,
        [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
          body: { participant: participantFixture },
        },
        'POST /api/swag/claims': { status: 201, body: { claim, duplicate: false } },
      });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await screen.findByTestId('swag__items');
      await handOut(user);
      expect(await screen.findByTestId('swag__undo')).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(11_000);
      await waitFor(() => expect(screen.queryByTestId('swag__undo')).toBeNull());
      // The confirmation line stays: the handout happened, only the way back expired.
      expect(screen.getByTestId('swag__outcome')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a reversed handout on the round list, struck through rather than gone', async () => {
    renderStation({
      ...liveStation,
      'GET /api/swag/rounds/round-1/claims': {
        body: {
          items: [
            { ...claim, id: 'claim-live' },
            { ...claim, id: 'claim-dead', isVoided: true },
          ],
        },
      },
    });
    const rows = await screen.findAllByTestId('swag__claim-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-voided', 'false');
    /*
     * A void that removed the line would read exactly like a handout that never registered,
     * and the counter's next move after those two is not the same one.
     */
    expect(rows[1]).toHaveAttribute('data-voided', 'true');
    expect(rows[1]).toHaveTextContent('taken back');
  });
});
