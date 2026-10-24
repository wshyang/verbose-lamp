import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { SwagClaimView } from '@psd/contracts';
import { SwagClaimsPage } from './SwagClaimsPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { superadminSession } from '../test-utils/fixtures.js';

/**
 * ADR-159 — the superadmin's swag claim corrections.
 *
 * The page is the scans page's twin, so the tests worth having are the ones about what is
 * NOT the same: that a void explains what it does and does not restore, that a voided row
 * offers the way back rather than disappearing, and that a handout already taken back at the
 * counter says so instead of looking like a superadmin decision nobody can find a reason for.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

const claim: SwagClaimView = {
  id: 'claim-1',
  participantId: 'participant-1',
  participantNickname: 'Pelican',
  clusterCode: 'BP',
  stationId: 'station-1',
  stationNameSnapshot: 'Goodie Bag Counter',
  roundNumberSnapshot: 1,
  itemLabelSnapshot: 'Tote bag',
  facilitatorUsernameSnapshot: 'fringe1',
  claimedAt: '2026-10-01T01:05:00.000Z',
  isVoided: false,
  undoneAt: null,
};

function renderPage(routes: RouteTable) {
  stub = installFetchStub({ 'GET /api/auth/session': { body: superadminSession }, ...routes });
  return renderWithProviders(<SwagClaimsPage />, { path: '/admin/swag-claims' });
}

describe('the swag claim corrections page (ADR-159)', () => {
  it('voids a claim with a reason, and says what the void does and does not restore', async () => {
    renderPage({
      'GET /api/admin/swag-claims': { body: { items: [claim] } },
      'POST /api/admin/swag-claims/claim-1/void': {
        body: { claim: { ...claim, isVoided: true } },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('swag-claims__void'));

    /*
     * The stock does not come back, and the dialog says so. A superadmin who believed it did
     * would stop counting what is left on the table, which is the one number nobody else has.
     */
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('allowance back');
    expect(dialog).toHaveTextContent('does not bring the stock back');

    await user.type(screen.getByTestId('reason-dialog__reason'), 'Wrong badge scanned.');
    await user.click(screen.getByTestId('reason-dialog__confirm'));

    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/swag-claims/claim-1/void')).toHaveLength(1),
    );
    expect(stub.callsTo('POST /api/admin/swag-claims/claim-1/void')[0]?.body).toMatchObject({
      reason: 'Wrong badge scanned.',
    });
  });

  it('offers Restore on a voided row rather than dropping it from the table', async () => {
    renderPage({
      'GET /api/admin/swag-claims': { body: { items: [{ ...claim, isVoided: true }] } },
      'POST /api/admin/swag-claims/claim-1/unvoid': { body: { claim } },
    });
    const user = userEvent.setup();
    const row = await screen.findByTestId('swag-claims__row');
    expect(row).toHaveAttribute('data-voided', 'true');
    expect(within(row).queryByTestId('swag-claims__void')).toBeNull();

    await user.click(within(row).getByTestId('swag-claims__unvoid'));
    await user.type(screen.getByTestId('reason-dialog__reason'), 'Voided the wrong row.');
    await user.click(screen.getByTestId('reason-dialog__confirm'));
    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/swag-claims/claim-1/unvoid')).toHaveLength(1),
    );
  });

  it('marks a handout the counter took back itself, which has no reason to look up', async () => {
    renderPage({
      'GET /api/admin/swag-claims': {
        body: {
          items: [
            { ...claim, isVoided: true, undoneAt: '2026-10-01T01:05:05.000Z' },
            { ...claim, id: 'claim-2' },
          ],
        },
      },
    });
    const rows = await screen.findAllByTestId('swag-claims__row');
    expect(within(rows[0] as HTMLElement).getByTestId('swag-claims__self-undone')).toBeInTheDocument();
    // A live handout carries no such mark — the label means something specific.
    expect(within(rows[1] as HTMLElement).queryByTestId('swag-claims__self-undone')).toBeNull();
  });

  it('filters by counter, asking the server rather than hiding rows locally', async () => {
    renderPage({ 'GET /api/admin/swag-claims': { body: { items: [claim] } } });
    const user = userEvent.setup();
    await screen.findByTestId('swag-claims__row');

    await user.selectOptions(screen.getByTestId('swag-claims__station-filter'), 'station-1');
    await waitFor(() =>
      expect(
        stub.callsTo('GET /api/admin/swag-claims').some((call) => call.path.includes('station-1')),
      ).toBe(true),
    );
  });

  it('refuses an empty reason locally, without troubling the server', async () => {
    renderPage({ 'GET /api/admin/swag-claims': { body: { items: [claim] } } });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('swag-claims__void'));
    await user.click(screen.getByTestId('reason-dialog__confirm'));

    /*
     * The ledger is only worth keeping if every row says why. Catching this here rather than
     * at the server keeps the dialog open with the text the superadmin already typed.
     */
    expect(stub.callsTo('POST /api/admin/swag-claims/claim-1/void')).toHaveLength(0);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('says so when nothing has been handed out', async () => {
    renderPage({ 'GET /api/admin/swag-claims': { body: { items: [] } } });
    expect(await screen.findByTestId('swag-claims__empty')).toBeInTheDocument();
  });
});
