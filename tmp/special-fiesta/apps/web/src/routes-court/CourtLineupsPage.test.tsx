import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FixtureView } from '@psd/contracts';
import { facilitatorShellRoutes } from '../test-utils/ambientRoutes.js';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { facilitatorSession } from '../test-utils/fixtures.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { seatName } from '../lib/hooks/useCourtLineups.js';
import { CourtLineupsPage, whenOf } from './CourtLineupsPage.js';

/** ADR-284 — the court console's Line-ups subtab: this court's planned matches, next first. */

let stub: FetchStub;
afterEach(() => stub?.restore());

function fixture(overrides: Partial<FixtureView> & { id: string }): FixtureView {
  return {
    stage: 'group',
    roundNumber: 1,
    groupCode: 'A',
    sequence: 1,
    teamAId: 't1',
    teamAName: 'Reds',
    teamBId: 't2',
    teamBName: 'Blues',
    suggestedCourtLabel: 'Court 1',
    estimatedStartAt: '2026-10-15T02:00:00.000Z',
    teamAFromSequence: null,
    teamBFromSequence: null,
    status: 'pending',
    resolvedWinnerTeamId: null,
    ...overrides,
  };
}

function render(items: FixtureView[]) {
  stub = installFetchStub({
    ...facilitatorShellRoutes(),
    'GET /api/auth/session': { body: facilitatorSession },
    'GET /api/tournament/courts': { body: { items: [{ id: 'c1', courtNumber: 1, displayLabel: 'Court 1', isEnabled: true, assignedFacilitatorId: null, assignedFacilitatorUsername: null, currentMatchId: null }] } },
    'GET /api/tournament/courts/c1/lineups': { body: { items } },
  });
  return renderWithProviders(<CourtLineupsPage />, { path: '/staff/court/c1/lineups', route: '/staff/court/:courtId/lineups', withSync: true });
}

describe('the court console Line-ups subtab', () => {
  it('lists this court’s matches, the next one marked, the live one as on court now', async () => {
    render([
      fixture({ id: 'live', sequence: 3, status: 'claimed' }),
      fixture({ id: 'next', sequence: 4, teamAName: null, teamAFromSequence: 1, estimatedStartAt: null }),
      fixture({ id: 'third', sequence: 5, stage: 'third_place', teamBName: null, teamBFromSequence: 2 }),
    ]);
    const rows = await screen.findAllByTestId('court-lineups__row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('On court now');
    expect(rows[0]).toHaveTextContent('Up next on this court');
    expect(rows[1]).toHaveTextContent('Winner of #1 v Blues');
    expect(rows[1]).toHaveTextContent('Time to be set');
    expect(rows[2]).toHaveTextContent('Reds v Loser of #2');
    expect(await screen.findByRole('heading', { name: 'Court 1' })).toBeInTheDocument();
    expect(screen.getByTestId('court-tabs__console')).toHaveAttribute('href', '/staff/court/c1');
  });

  it('says when nothing is planned on the court', async () => {
    render([]);
    expect(await screen.findByTestId('court-lineups__empty')).toHaveTextContent('Nothing planned on this court yet.');
  });

  it('names a seat with no team and no feeder as undecided, and reads a planned time', () => {
    expect(seatName(fixture({ id: 'x', teamAName: null, teamAFromSequence: null }), 'a')).toBe('To be decided');
    expect(seatName(fixture({ id: 'x', teamBName: null, teamBFromSequence: undefined }), 'b')).toBe('To be decided');
    expect(whenOf(fixture({ id: 'x' }))).not.toBe('Time to be set');
  });
});
