import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ClustersPage } from './ClustersPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { superadminSession } from '../test-utils/fixtures.js';

/**
 * ADR-172 — S44 the cluster catalogue.
 *
 * What is worth asserting here is not that the buttons post, but that the page tells the truth
 * about what it will refuse. Every rule in this feature is a refusal, and a console that only
 * discovers them by being told no makes the superadmin guess.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

function render(routes: RouteTable) {
  stub = installFetchStub({ 'GET /api/auth/session': { body: superadminSession }, ...routes });
  return renderWithProviders(<ClustersPage />);
}

const open = {
  code: 'OLI',
  displayName: 'OLI',
  memberCount: 0,
  retiredAt: null,
  isRetired: false,
};
const peopled = { ...open, code: 'WD', displayName: 'WD', memberCount: 3 };
const retired = {
  ...open,
  code: 'OLD',
  displayName: 'Old Group',
  retiredAt: '2026-10-01T00:00:00.000Z',
  isRetired: true,
};

function catalogue(items: unknown[], scoringStarted = false) {
  return { 'GET /api/admin/clusters': { body: { items, scoringStarted } } };
}

describe('the cluster catalogue (ADR-172)', () => {
  it('adds a cluster with a code and a display name', async () => {
    render({
      ...catalogue([open]),
      'POST /api/admin/clusters': { status: 201, body: { cluster: open } },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('clusters__code'), 'NEW');
    await user.type(screen.getByTestId('clusters__name'), 'Newly Formed');
    await user.click(screen.getByTestId('clusters__submit'));

    await waitFor(() => expect(stub.callsTo('POST /api/admin/clusters')).toHaveLength(1));
    expect(stub.callsTo('POST /api/admin/clusters')[0]?.body).toEqual({
      code: 'NEW',
      displayName: 'Newly Formed',
    });
  });

  it('renames only the display name, and will not let the code be edited', async () => {
    render({
      ...catalogue([open]),
      'PUT /api/admin/clusters/OLI': { body: { cluster: { ...open, displayName: 'Renamed' } } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('clusters__rename'));

    /*
     * The code is the primary key `participant`, `chat_message` and `gallery_photo` point at.
     * Disabling the field is the whole reason a rename is safe to offer at all.
     */
    expect(screen.getByTestId('clusters__code')).toBeDisabled();

    const name = screen.getByTestId('clusters__name');
    await user.clear(name);
    await user.type(name, 'Renamed');
    await user.click(screen.getByTestId('clusters__submit'));

    await waitFor(() => expect(stub.callsTo('PUT /api/admin/clusters/OLI')).toHaveLength(1));
    expect(stub.callsTo('PUT /api/admin/clusters/OLI')[0]?.body).toEqual({
      displayName: 'Renamed',
    });
  });

  it('will not offer to retire a cluster that still has members, and says why', async () => {
    render(catalogue([peopled]));
    const retire = await screen.findByTestId('clusters__retire');

    expect(retire).toBeDisabled();
    expect(retire).toHaveAttribute('title', 'Move its participants out first.');
    // And the remedy is right there rather than somewhere else in the console.
    expect(screen.getByTestId('clusters__move')).toBeInTheDocument();
  });

  it('moves the members out, which is what makes the retire possible', async () => {
    render({
      ...catalogue([peopled, open]),
      'POST /api/admin/clusters/WD/reassign': { body: { moved: 3, cluster: peopled } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('clusters__move'));

    // Destructive and retroactive, so it is confirmed rather than done on one click.
    expect(await screen.findByTestId('confirm-dialog__body')).toHaveTextContent(
      /points go with them/i,
    );
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/clusters/WD/reassign')).toHaveLength(1),
    );
    expect(stub.callsTo('POST /api/admin/clusters/WD/reassign')[0]?.body).toEqual({
      toClusterCode: 'OLI',
    });
  });

  it('moves them where the superadmin chose, not merely to the first option', async () => {
    const second = { ...open, code: 'CS', displayName: 'CS' };
    render({
      ...catalogue([peopled, open, second]),
      'POST /api/admin/clusters/WD/reassign': { body: { moved: 3, cluster: peopled } },
    });
    const user = userEvent.setup();
    // The default is whatever sorts first; picking another is the case that would silently
    // send everyone to the wrong cluster if the select were not wired to the request.
    await user.selectOptions(await screen.findByTestId('clusters__move-target'), 'CS');
    await user.click(screen.getByTestId('clusters__move'));
    await user.click(await screen.findByTestId('confirm-dialog__confirm'));

    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/clusters/WD/reassign')).toHaveLength(1),
    );
    expect(stub.callsTo('POST /api/admin/clusters/WD/reassign')[0]?.body).toEqual({
      toClusterCode: 'CS',
    });
  });

  it('never offers a retired cluster as somewhere to move people to', async () => {
    // `open` is here so the select has a legitimate option: the assertion is that the retired
    // one is missing from a list that is otherwise populated, not that the list is empty.
    render(catalogue([peopled, retired, open]));
    await screen.findByTestId('clusters__move-target');

    /*
     * Moving people into a retired cluster would immediately re-break the rule that a retired
     * cluster is empty — and would do it silently, since nothing re-checks afterwards.
     */
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('OLI');
    expect(options).not.toContain('Old Group');
  });

  it('retires an empty cluster, promising that nothing is deleted', async () => {
    render({
      ...catalogue([open]),
      'POST /api/admin/clusters/OLI/retire': { body: { cluster: { ...open, isRetired: true } } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('clusters__retire'));

    expect(await screen.findByTestId('confirm-dialog__body')).toHaveTextContent(/Nothing is deleted/i);
    await user.click(screen.getByTestId('confirm-dialog__confirm'));
    await waitFor(() => expect(stub.callsTo('POST /api/admin/clusters/OLI/retire')).toHaveLength(1));
  });

  it('offers to restore a retired cluster rather than to recreate it', async () => {
    render({
      ...catalogue([retired]),
      'POST /api/admin/clusters/OLD/restore': { body: { cluster: { ...retired, isRetired: false } } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('clusters__restore'));
    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/clusters/OLD/restore')).toHaveLength(1),
    );
    // No retire button on a row that is already retired.
    expect(screen.queryByTestId('clusters__retire')).not.toBeInTheDocument();
  });

  it('explains the freeze up front once scoring has started', async () => {
    render(catalogue([open, peopled], true));

    expect(await screen.findByTestId('clusters__locked')).toHaveTextContent(
      /Scoring has started/i,
    );
    // Retiring is off, with the reason on the control itself.
    expect(screen.getAllByTestId('clusters__retire')[0]).toBeDisabled();
    expect(screen.getAllByTestId('clusters__retire')[0]).toHaveAttribute(
      'title',
      'Scoring has started.',
    );
    // And moving is withdrawn entirely rather than offered and then refused.
    expect(screen.queryByTestId('clusters__move')).not.toBeInTheDocument();
  });

  it('still allows adding and renaming after scoring, because neither moves a point', async () => {
    render({
      ...catalogue([open], true),
      'POST /api/admin/clusters': { status: 201, body: { cluster: open } },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('clusters__code'), 'LATE');
    await user.type(screen.getByTestId('clusters__name'), 'Walked in late');
    await user.click(screen.getByTestId('clusters__submit'));

    await waitFor(() => expect(stub.callsTo('POST /api/admin/clusters')).toHaveLength(1));
    expect(screen.getByTestId('clusters__rename')).toBeEnabled();
  });

  it('shows the error the server gave rather than a generic failure', async () => {
    render({
      ...catalogue([open]),
      'POST /api/admin/clusters': {
        status: 409,
        body: { error: { message: 'A cluster with that code already exists.', field: 'code' } },
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('clusters__code'), 'OLI');
    await user.type(screen.getByTestId('clusters__name'), 'Duplicate');
    await user.click(screen.getByTestId('clusters__submit'));

    expect(await screen.findByTestId('clusters__error')).toHaveTextContent(/already exists/i);
  });
});
