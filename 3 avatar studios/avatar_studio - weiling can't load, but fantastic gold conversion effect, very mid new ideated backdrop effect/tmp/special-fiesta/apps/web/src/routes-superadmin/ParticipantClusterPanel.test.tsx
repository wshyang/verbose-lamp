import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParticipantClusterPanel } from './ParticipantClusterPanel.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { superadminSession } from '../test-utils/fixtures.js';

/** ADR-172 — correcting one participant's cluster from the person, not the catalogue. */

let stub: FetchStub;
afterEach(() => stub?.restore());

const clusters = [
  { code: 'OLI', displayName: 'OLI', memberCount: 1, retiredAt: null, isRetired: false },
  { code: 'WD', displayName: 'WD', memberCount: 0, retiredAt: null, isRetired: false },
  {
    code: 'OLD',
    displayName: 'Old Group',
    memberCount: 0,
    retiredAt: '2026-10-01T00:00:00.000Z',
    isRetired: true,
  },
];

function render(routes: RouteTable, onMoved = vi.fn()) {
  stub = installFetchStub({ 'GET /api/auth/session': { body: superadminSession }, ...routes });
  const view = renderWithProviders(
    <ParticipantClusterPanel participantId="p-1" clusterCode="OLI" onMoved={onMoved} />,
  );
  return { ...view, onMoved };
}

describe('participant cluster correction (ADR-172)', () => {
  it('moves the participant and refreshes the page that shows their cluster', async () => {
    const { onMoved } = render({
      'GET /api/admin/clusters': { body: { items: clusters, scoringStarted: false } },
      'PUT /api/admin/participants/p-1/cluster': {
        body: { participant: { id: 'p-1', clusterCode: 'WD' } },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('participant-detail__cluster-move'));

    await waitFor(() =>
      expect(stub.callsTo('PUT /api/admin/participants/p-1/cluster')).toHaveLength(1),
    );
    expect(stub.callsTo('PUT /api/admin/participants/p-1/cluster')[0]?.body).toEqual({
      toClusterCode: 'WD',
    });
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
  });

  it('never offers their current cluster, nor a retired one', async () => {
    render({ 'GET /api/admin/clusters': { body: { items: clusters, scoringStarted: false } } });
    await screen.findByTestId('participant-detail__cluster-target');

    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['WD']);
  });

  it('sends the cluster that was chosen, not the one that happened to be first', async () => {
    const withThird = [
      ...clusters,
      { code: 'CS', displayName: 'CS', memberCount: 0, retiredAt: null, isRetired: false },
    ];
    render({
      'GET /api/admin/clusters': { body: { items: withThird, scoringStarted: false } },
      'PUT /api/admin/participants/p-1/cluster': {
        body: { participant: { id: 'p-1', clusterCode: 'CS' } },
      },
    });
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByTestId('participant-detail__cluster-target'), 'CS');
    await user.click(screen.getByTestId('participant-detail__cluster-move'));

    await waitFor(() =>
      expect(stub.callsTo('PUT /api/admin/participants/p-1/cluster')).toHaveLength(1),
    );
    expect(stub.callsTo('PUT /api/admin/participants/p-1/cluster')[0]?.body).toEqual({
      toClusterCode: 'CS',
    });
  });

  it('withdraws the control once scoring has started, and says why', async () => {
    render({ 'GET /api/admin/clusters': { body: { items: clusters, scoringStarted: true } } });

    expect(await screen.findByTestId('participant-detail__cluster-locked')).toHaveTextContent(
      /already earned/i,
    );
    expect(screen.queryByTestId('participant-detail__cluster-move')).not.toBeInTheDocument();
  });

  it('surfaces the server refusal rather than failing silently', async () => {
    render({
      'GET /api/admin/clusters': { body: { items: clusters, scoringStarted: false } },
      'PUT /api/admin/participants/p-1/cluster': {
        status: 409,
        body: { error: { message: 'Scoring has started, so clusters can no longer be retired or reassigned.' } },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('participant-detail__cluster-move'));

    expect(await screen.findByTestId('participant-detail__cluster-error')).toHaveTextContent(
      /Scoring has started/i,
    );
  });
});
