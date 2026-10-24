import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { emptyStates } from '@psd/contracts';
import type { AgendaItemView } from '@psd/contracts';
import { AgendaPage } from './AgendaPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { participantSession } from '../test-utils/fixtures.js';

/**
 * ADR-177 — the Agenda segment of the Ball tab.
 *
 * The assertions here are the three the design actually rests on, rather than "a list renders":
 * the NOW row is unmissable, a CANCELLED item stays on the page instead of vanishing, and a
 * timeless item renders without a fabricated clock. Each one is a decision that a future tidy-up
 * could quietly reverse while keeping the page looking fine.
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
    detail: null,
    isActive: true,
    ...overrides,
  };
}

function render(routes: RouteTable) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: participantSession },
    'GET /api/teams/mine': { body: { team: null } },
    ...routes,
  });
  return renderWithProviders(<AgendaPage />);
}

describe('Agenda segment', () => {
  it('marks the item happening now, and only that one', async () => {
    render({
      'GET /api/agenda': {
        body: {
          items: [item(), item({ id: 'ag-2', title: 'Prize presentation' })],
          nowId: 'ag-1',
          nextId: 'ag-2',
          asOf: '2026-11-05T07:00:00.000Z',
        },
      },
    });

    const rows = await screen.findAllByTestId('agenda__item');
    expect(within(rows[0]!).getByText('NOW')).toBeVisible();
    expect(within(rows[1]!).getByText('Up next')).toBeVisible();
    // The badge is singular — two NOW rows would be a derivation bug, not a styling one.
    expect(screen.getAllByText('NOW')).toHaveLength(1);
  });

  it('keeps a cancelled item on the page, struck through and labelled', async () => {
    render({
      'GET /api/agenda': {
        body: {
          items: [item({ title: 'Beach games', isActive: false })],
          nowId: null,
          nextId: null,
          asOf: '2026-11-05T07:00:00.000Z',
        },
      },
    });

    const row = await screen.findByTestId('agenda__item');
    // Visible, not hidden: somebody who memorised it has to learn that it is off.
    expect(within(row).getByText('Beach games')).toBeVisible();
    expect(within(row).getByText('CANCELLED')).toBeVisible();
    expect(row.className).toContain('gb-agenda__item--off');
  });

  it('renders a timeless item without inventing a clock for it', async () => {
    render({
      'GET /api/agenda': {
        body: {
          items: [
            item({
              title: 'Before departure: have an early lunch',
              startsAt: null,
              endsAt: null,
              location: null,
            }),
          ],
          nowId: null,
          nextId: null,
          asOf: '2026-11-05T07:00:00.000Z',
        },
      },
    });

    const row = await screen.findByTestId('agenda__item');
    expect(within(row).getByText('—')).toBeVisible();
  });

  it('shows a moment as a single time rather than a range', async () => {
    render({
      'GET /api/agenda': {
        body: {
          items: [item({ title: 'Meet at the pavilion', endsAt: null })],
          nowId: null,
          nextId: 'ag-1',
          asOf: '2026-11-05T05:00:00.000Z',
        },
      },
    });

    const row = await screen.findByTestId('agenda__item');
    expect(within(row).queryByText(/–/)).toBeNull();
  });

  it('says so plainly when no programme has been published', async () => {
    render({
      'GET /api/agenda': {
        body: { items: [], nowId: null, nextId: null, asOf: '2026-11-05T07:00:00.000Z' },
      },
    });

    expect(await screen.findByText(emptyStates.agenda)).toBeVisible();
  });

  it('shows the note under an item that carries one', async () => {
    render({
      'GET /api/agenda': {
        body: {
          items: [item({ detail: 'Bring a hat; there is no shade on court 3' })],
          nowId: null,
          nextId: null,
          asOf: '2026-11-05T07:00:00.000Z',
        },
      },
    });

    const row = await screen.findByTestId('agenda__item');
    expect(within(row).getByText('Bring a hat; there is no shade on court 3')).toBeVisible();
  });

  it('reloads the programme when the list is pulled down and released (ADR-096)', async () => {
    render({
      'GET /api/agenda': {
        body: {
          items: [item()],
          nowId: null,
          nextId: null,
          asOf: '2026-11-05T07:00:00.000Z',
        },
        delayMs: 25,
      },
    });
    await screen.findByTestId('agenda__item');
    const before = stub.callsTo('GET /api/agenda').length;

    const surface = screen.getByTestId('agenda__pull');
    const pullTo = (type: string, clientY: number | null) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: clientY === null ? [] : [{ clientY }] });
      act(() => {
        surface.dispatchEvent(event);
      });
    };
    pullTo('touchstart', 100);
    pullTo('touchmove', 300);
    expect(screen.getByTestId('agenda__pull-hint').textContent).toBe('Release to refresh');
    pullTo('touchend', null);

    await waitFor(() => expect(stub.callsTo('GET /api/agenda').length).toBe(before + 1));
    expect(screen.getByTestId('agenda__pull-hint').textContent).toBe('Refreshing…');
  });

  it('offers all three segments of the Ball tab', async () => {
    render({
      'GET /api/agenda': {
        body: { items: [], nowId: null, nextId: null, asOf: '2026-11-05T07:00:00.000Z' },
      },
    });

    const links = await screen.findAllByTestId('feed-tabs__link');
    expect(links.map((link) => link.textContent)).toEqual(['Results', 'Line-ups', 'Agenda']);
  });
});
