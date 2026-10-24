import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SwagStationsPage } from './SwagStationsPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { expectEveryFieldDescribed } from '../test-utils/fieldHelpWalk.js';
import { superadminSession } from '../test-utils/fixtures.js';

/** ADR-110 — swag administration: create with an item list, list, toggle. */

let stub: FetchStub;
afterEach(() => stub?.restore());

function render(routes: RouteTable) {
  stub = installFetchStub({ 'GET /api/auth/session': { body: superadminSession }, ...routes });
  return renderWithProviders(<SwagStationsPage />);
}

const existing = {
  id: 'station-1',
  stationName: 'Goodie Bag Counter',
  items: [{ label: 'Tote bag', limit: 1 }],
  isActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  currentRound: null,
};

describe('swag stations admin (ADR-110)', () => {
  it('loads a station into the form and saves the new name and items (ADR-188)', async () => {
    render({
      'GET /api/admin/swag-stations': { body: { items: [existing] } },
      'PUT /api/admin/swag-stations/station-1': { body: { station: existing } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('swag-admin__edit'));

    // The one form does both jobs, so it must say which one it is doing.
    expect(screen.getByTestId('swag-admin__create')).toHaveTextContent('Save station');
    const name = screen.getByTestId('swag-admin__name');
    expect(name).toHaveValue('Goodie Bag Counter');

    await user.clear(name);
    await user.type(name, 'Merch Marquee');
    await user.clear(screen.getByTestId('swag-admin__item-limit'));
    await user.type(screen.getByTestId('swag-admin__item-limit'), '2');
    await user.click(screen.getByTestId('swag-admin__create'));

    await waitFor(() =>
      expect(stub.callsTo('PUT /api/admin/swag-stations/station-1')).toHaveLength(1),
    );
    expect(stub.callsTo('PUT /api/admin/swag-stations/station-1')[0]?.body).toEqual({
      stationName: 'Merch Marquee',
      items: [{ label: 'Tote bag', limit: 2 }],
    });
  });

  it('cancelling an edit empties the form rather than leaving it half-loaded', async () => {
    render({ 'GET /api/admin/swag-stations': { body: { items: [existing] } } });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('swag-admin__edit'));
    await user.click(screen.getByTestId('swag-admin__cancel'));

    expect(screen.getByTestId('swag-admin__name')).toHaveValue('');
    expect(screen.getByTestId('swag-admin__create')).toHaveTextContent('Create station');
  });

  it('creates a station with its items', async () => {
    render({
      'GET /api/admin/swag-stations': { body: { items: [] } },
      'POST /api/admin/swag-stations': { status: 201, body: { station: existing } },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('swag-admin__name'), 'Goodie Bag Counter');
    await user.type(screen.getByTestId('swag-admin__item-label'), 'Tote bag');
    await user.click(screen.getByTestId('swag-admin__create'));

    await waitFor(() => expect(stub.callsTo('POST /api/admin/swag-stations')).toHaveLength(1));
    expect(stub.callsTo('POST /api/admin/swag-stations')[0]?.body).toEqual({
      stationName: 'Goodie Bag Counter',
      items: [{ label: 'Tote bag', limit: 1 }],
    });
  });

  it('adds and removes item rows, and sends every row typed', async () => {
    render({
      'GET /api/admin/swag-stations': { body: { items: [] } },
      'POST /api/admin/swag-stations': { status: 201, body: { station: existing } },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('swag-admin__name'), 'Counter Two');
    await user.click(screen.getByTestId('swag-admin__add-item'));
    const labels = screen.getAllByTestId('swag-admin__item-label');
    expect(labels).toHaveLength(2);
    await user.type(labels[0] as HTMLElement, 'Cap');
    await user.type(labels[1] as HTMLElement, 'Towel');
    const limits = screen.getAllByTestId('swag-admin__item-limit');
    await user.clear(limits[1] as HTMLElement);
    await user.type(limits[1] as HTMLElement, '3');

    // One row removed: only the survivor is sent.
    await user.click(screen.getAllByTestId('swag-admin__remove-item')[0] as HTMLElement);
    await user.click(screen.getByTestId('swag-admin__create'));
    await waitFor(() => expect(stub.callsTo('POST /api/admin/swag-stations')).toHaveLength(1));
    expect(stub.callsTo('POST /api/admin/swag-stations')[0]?.body).toEqual({
      stationName: 'Counter Two',
      items: [{ label: 'Towel', limit: 3 }],
    });
  });

  it('caps the catalogue at six rows', async () => {
    render({ 'GET /api/admin/swag-stations': { body: { items: [] } } });
    const user = userEvent.setup();
    const add = await screen.findByTestId('swag-admin__add-item');
    for (let extra = 0; extra < 5; extra += 1) {
      await user.click(add);
    }
    expect(screen.getAllByTestId('swag-admin__item-label')).toHaveLength(6);
    expect(screen.queryByTestId('swag-admin__add-item')).toBeNull();
  });

  it('shows the refusal inline and marks inactive stations', async () => {
    render({
      'GET /api/admin/swag-stations': { body: { items: [{ ...existing, isActive: false }] } },
      'POST /api/admin/swag-stations': {
        status: 409,
        body: { error: { message: 'Station names are 3-50 characters and must be unique.' } },
      },
    });
    const user = userEvent.setup();
    expect(await screen.findByTestId('swag-admin__row')).toHaveTextContent('inactive');
    expect(screen.getByTestId('swag-admin__toggle')).toHaveTextContent('Activate');

    await user.type(screen.getByTestId('swag-admin__name'), 'Goodie Bag Counter');
    await user.type(screen.getByTestId('swag-admin__item-label'), 'Tote bag');
    await user.click(screen.getByTestId('swag-admin__create'));
    expect(await screen.findByTestId('swag-admin__error')).toHaveTextContent('must be unique');
  });

  it('lists stations with their catalogue and toggles one inactive', async () => {
    render({
      'GET /api/admin/swag-stations': { body: { items: [existing] } },
      'PATCH /api/admin/swag-stations/station-1/active': {
        body: { station: { ...existing, isActive: false } },
      },
    });
    const row = await screen.findByTestId('swag-admin__row');
    expect(row).toHaveTextContent('Tote bag ×1');

    await userEvent.setup().click(screen.getByTestId('swag-admin__toggle'));
    await waitFor(() =>
      expect(stub.callsTo('PATCH /api/admin/swag-stations/station-1/active')).toHaveLength(1),
    );
  });
});

describe('Every field carries its help (ADR-322)', () => {
  it('the swag station form, item limits included', async () => {
    render({ 'GET /api/admin/swag-stations': { body: { items: [] } } });
    await screen.findByTestId('swag-admin__name');
    expectEveryFieldDescribed(document.body, 3);
  });
});
