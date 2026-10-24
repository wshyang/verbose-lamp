import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyStates } from '@psd/contracts';
import type { AgendaItemView } from '@psd/contracts';
import { AgendaPage } from './AgendaPage.js';
import { renderWithProviders, confirmDialog } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { expectEveryFieldDescribed } from '../test-utils/fieldHelpWalk.js';
import { superadminSession } from '../test-utils/fixtures.js';

/**
 * ADR-177 — the run-sheet console. The assertions are about the two things that make this screen
 * different from the other config pages: cancelling is a confirmed act that says what it does to
 * the participant's page, and there is no delete button to reach for instead.
 */

let stub: FetchStub;

afterEach(() => stub?.restore());

function item(overrides: Partial<AgendaItemView> = {}): AgendaItemView {
  return {
    id: 'ag-1',
    startsAt: '2026-11-05T06:30:00.000Z',
    endsAt: '2026-11-05T08:30:00.000Z',
    title: "Captain's Ball",
    location: 'Courts 1-3',
    detail: 'Runs alongside the fringe',
    isActive: true,
    ...overrides,
  };
}

function render(routes: RouteTable) {
  stub = installFetchStub({ 'GET /api/auth/session': { body: superadminSession }, ...routes });
  return renderWithProviders(<AgendaPage />);
}

describe('Programme console', () => {
  it('lists the day with its times, note and state', async () => {
    render({ 'GET /api/admin/agenda': { body: { items: [item()] } } });

    const row = await screen.findByTestId('agenda__row');
    expect(within(row).getByText("Captain's Ball")).toBeVisible();
    expect(within(row).getByText('Runs alongside the fringe')).toBeVisible();
    expect(within(row).getByText('Courts 1-3')).toBeVisible();
    expect(within(row).getByText('On')).toBeVisible();
  });

  it('renders a timeless item as such, and a moment as a single time', async () => {
    render({
      'GET /api/admin/agenda': {
        body: {
          items: [
            item({ id: 'ag-0', startsAt: null, endsAt: null, location: null, detail: null }),
            item({ id: 'ag-2', endsAt: null }),
          ],
        },
      },
    });

    const rows = await screen.findAllByTestId('agenda__row');
    expect(within(rows[0]!).getByText('No fixed time')).toBeVisible();
    expect(within(rows[0]!).getByText('—')).toBeVisible();
    expect(within(rows[1]!).queryByText(/–/)).toBeNull();
  });

  it('asks before cancelling, and says what the participant will see', async () => {
    render({
      'GET /api/admin/agenda': { body: { items: [item()] } },
      'PATCH /api/admin/agenda/ag-1/active': { body: { item: item({ isActive: false }) } },
    });

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('agenda__toggle'));
    expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent('struck through');
    await confirmDialog(user);

    await waitFor(() =>
      expect(stub.callsTo('PATCH /api/admin/agenda/ag-1/active')[0]?.body).toEqual({
        isEnabled: false,
      }),
    );
  });

  it('offers a restore on a cancelled item, and never a delete', async () => {
    render({
      'GET /api/admin/agenda': { body: { items: [item({ isActive: false })] } },
      'PATCH /api/admin/agenda/ag-1/active': { body: { item: item() } },
    });

    const row = await screen.findByTestId('agenda__row');
    expect(within(row).getByText('Cancelled')).toBeVisible();
    expect(screen.getByTestId('agenda__toggle')).toHaveTextContent('Restore');
    // No delete control anywhere — the only mention of the word is the note explaining its absence.
    expect(
      screen.queryAllByRole('button').some((button) => /delete|remove/i.test(button.textContent ?? '')),
    ).toBe(false);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('agenda__toggle'));
    await confirmDialog(user);
    await waitFor(() =>
      expect(stub.callsTo('PATCH /api/admin/agenda/ag-1/active')[0]?.body).toEqual({
        isEnabled: true,
      }),
    );
  });

  it('loads a row into the form to edit it, and lets the edit be abandoned', async () => {
    render({ 'GET /api/admin/agenda': { body: { items: [item()] } } });

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('agenda__edit'));
    expect(screen.getByTestId('agenda__title')).toHaveValue("Captain's Ball");
    expect(screen.getByTestId('agenda__submit')).toHaveTextContent('Save changes');

    await user.click(screen.getByTestId('agenda__cancel'));
    expect(screen.getByTestId('agenda__title')).toHaveValue('');
    expect(screen.getByTestId('agenda__submit')).toHaveTextContent('Add item');
  });

  it('adds an item, sending the typed date and time as an instant', async () => {
    render({
      'GET /api/admin/agenda': { body: { items: [item()] } },
      'POST /api/admin/agenda': { body: { item: item({ id: 'ag-new' }) } },
    });
    await screen.findByTestId('agenda__row');

    const user = userEvent.setup();
    await user.type(screen.getByTestId('agenda__title'), 'Group photo');
    await user.type(screen.getByTestId('agenda__start'), '2026-11-05T17:20');
    await user.type(screen.getByTestId('agenda__location'), 'Emerald Pavilion');
    await user.type(screen.getByTestId('agenda__detail'), 'Everyone, please');
    await user.click(screen.getByTestId('agenda__submit'));

    await waitFor(() => expect(stub.callsTo('POST /api/admin/agenda')).toHaveLength(1));
    const body = stub.callsTo('POST /api/admin/agenda')[0]?.body as Record<string, unknown>;
    expect(body['title']).toBe('Group photo');
    expect(body['endsAt']).toBeNull();
    expect(body['detail']).toBe('Everyone, please');
    // ADR-186 — the date rides along with the time instead of being inferred from the programme.
    const startsAt = new Date(body['startsAt'] as string);
    expect(startsAt.getFullYear()).toBe(2026);
    expect(startsAt.getDate()).toBe(5);
    expect(startsAt.getHours()).toBe(17);
  });

  it('offers up and down only on the items with no fixed time (ADR-190)', async () => {
    const timeless = item({ id: 'ag-0', startsAt: null, endsAt: null, title: 'Early lunch' });
    render({
      'GET /api/admin/agenda': { body: { items: [timeless, item()] } },
      'POST /api/admin/agenda/ag-0/move': { body: { items: [timeless, item()] } },
    });
    await waitFor(() => expect(screen.getAllByTestId('agenda__row')).toHaveLength(2));

    // One pair of arrows, on the timeless row — a timed item is placed by its clock.
    expect(screen.getAllByTestId('agenda__move-down')).toHaveLength(1);
    expect(screen.getByLabelText('Move Early lunch down')).toBeVisible();

    await userEvent.setup().click(screen.getByTestId('agenda__move-down'));
    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/agenda/ag-0/move')).toHaveLength(1),
    );
    expect(stub.callsTo('POST /api/admin/agenda/ag-0/move')[0]?.body).toEqual({
      direction: 'down',
    });
  });

  it('surfaces a rejected write instead of swallowing it', async () => {
    render({
      'GET /api/admin/agenda': { body: { items: [] } },
      'POST /api/admin/agenda': {
        status: 400,
        body: { error: { message: 'An end time needs a start time.' } },
      },
    });
    expect(await screen.findByText(emptyStates.agenda)).toBeVisible();

    const user = userEvent.setup();
    await user.type(screen.getByTestId('agenda__title'), 'Closing speech');
    // An end with no start is exactly what the route refuses, so type one.
    await user.type(screen.getByTestId('agenda__end'), '2026-11-05T17:10');
    await user.click(screen.getByTestId('agenda__submit'));

    expect(await screen.findByTestId('agenda__error')).toHaveTextContent(
      'An end time needs a start time.',
    );
  });
});

describe('Every field carries its help (ADR-322)', () => {
  it('the agenda item form', async () => {
    render({ 'GET /api/admin/agenda': { body: { items: [] } } });
    await screen.findByTestId('agenda__title');
    expectEveryFieldDescribed(document.body, 5);
  });
});
