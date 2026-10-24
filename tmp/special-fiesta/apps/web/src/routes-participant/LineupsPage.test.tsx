import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { emptyStates } from '@psd/contracts';
import type { FixtureView, TournamentView } from '@psd/contracts';
import { LineupsPage } from './LineupsPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { participantSession, teamFixture } from '../test-utils/fixtures.js';

/**
 * ADR-089 — the Line-ups tab (S60's new sibling). The assertions are about what a player
 * on a bench needs: who plays next, where, and an unmissable flag on THEIR team.
 */

let stub: FetchStub;

afterEach(() => stub?.restore());

const tournament: TournamentView = {
  id: 'tour-1',
  format: 'world_cup',
  status: 'group_stage',
  groupSize: 4,
  advanceCount: 2,
  hasThirdPlace: false,
  knockoutPairing: 'classic' as const,
  activatedAt: '2026-10-01T09:00:00.000Z',
};

function fixture(overrides: Partial<FixtureView>): FixtureView {
  return {
    id: 'fx-1',
    stage: 'group',
    roundNumber: 1,
    groupCode: 'A',
    sequence: 1,
    teamAId: 'team-x',
    teamAName: 'Sandstorm',
    teamBId: 'team-y',
    teamBName: 'Wave Riders',
    suggestedCourtLabel: 'Court 1',
    status: 'pending',
    resolvedWinnerTeamId: null,
    ...overrides,
  };
}

function render(routes: RouteTable) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: participantSession },
    'GET /api/teams/mine': { body: { team: null } },
    ...routes,
  });
  return renderWithProviders(<LineupsPage />);
}

describe('Line-ups tab', () => {
  it('lists fixtures in play order with stage, court and an Up next badge on the first', async () => {
    render({
      'GET /api/tournament/lineups': {
        body: {
          tournament,
          items: [
            fixture({}),
            fixture({ id: 'fx-2', sequence: 2, teamAName: 'Coconuts', teamBName: 'Breakers' }),
          ],
        },
      },
    });
    const rows = await screen.findAllByTestId('lineups__row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(/Sandstorm vs Wave Riders/)).toBeVisible();
    expect(within(rows[0]!).getByText('Up next')).toBeVisible();
    expect(within(rows[0]!).getByText(/Group A · Court 1/)).toBeVisible();
    expect(within(rows[1]!).getByText('#2')).toBeVisible();
  });

  it('flags the viewer’s own team with the gold treatment and a YOUR TEAM badge', async () => {
    render({
      'GET /api/teams/mine': { body: { team: teamFixture } },
      'GET /api/tournament/lineups': {
        body: {
          tournament,
          items: [
            fixture({}),
            fixture({ id: 'fx-2', sequence: 2, teamAId: teamFixture.id, teamAName: teamFixture.teamName }),
          ],
        },
      },
    });
    const mine = await screen.findByTestId('lineups__row-mine');
    expect(mine).toHaveClass('gb-lineup--mine');
    expect(within(mine).getByTestId('lineups__your-team')).toBeVisible();
    // The other fixture stays plain.
    expect(screen.getByTestId('lineups__row')).not.toHaveClass('gb-lineup--mine');
  });

  it('labels a claimed fixture as in play, and shows TBD for an unresolved knockout seat', async () => {
    render({
      'GET /api/tournament/lineups': {
        body: {
          tournament: { ...tournament, status: 'knockout' },
          items: [
            fixture({ status: 'claimed' }),
            fixture({
              id: 'fx-3',
              stage: 'knockout',
              roundNumber: 2,
              groupCode: null,
              sequence: 13,
              teamBId: null,
              teamBName: null,
            }),
            fixture({
              id: 'fx-4',
              stage: 'knockout',
              roundNumber: 2,
              groupCode: null,
              sequence: 14,
              teamAId: null,
              teamAName: null,
              suggestedCourtLabel: null,
            }),
            fixture({ id: 'fx-5', sequence: 15, groupCode: null }),
          ],
        },
      },
    });
    expect(await screen.findByText('In play now')).toBeVisible();
    expect(screen.getByText(/Sandstorm vs Winner TBD/)).toBeVisible();
    // A seat with no team yet and no suggested court still reads cleanly.
    expect(screen.getByText(/Winner TBD vs Wave Riders/)).toBeVisible();
    expect(screen.getAllByText(/Knockout · round 2/)).toHaveLength(2);
  });

  it('names a TBD seat by its feeder match — "Winner of #N" (ADR-111)', async () => {
    render({
      'GET /api/tournament/lineups': {
        body: {
          tournament,
          items: [
            fixture({
              id: 'fx-semi',
              teamAName: null,
              teamAId: null,
              teamAFromSequence: 7,
              teamBName: 'Sandstorm',
            }),
            fixture({ id: 'fx-final', teamAName: null, teamAId: null, teamBName: null, teamBId: null }),
          ],
          viewerUpSoon: null,
        },
      },
    });

    const rows = await screen.findAllByTestId('lineups__row');
    // The feeder is known: say so. No feeder info: the honest old TBD.
    expect(rows[0]).toHaveTextContent('Winner of #7 vs Sandstorm');
    expect(rows[1]).toHaveTextContent('Winner TBD vs Winner TBD');
  });

  it('names the third-place seats after the teams who LOSE their semis (ADR-137)', async () => {
    render({
      'GET /api/tournament/lineups': {
        body: {
          tournament,
          items: [
            fixture({
              id: 'fx-third',
              stage: 'third_place',
              roundNumber: 2,
              groupCode: null,
              sequence: 15,
              teamAId: null,
              teamAName: null,
              teamAFromSequence: 13,
              teamBId: null,
              teamBName: null,
              teamBFromSequence: 14,
            }),
          ],
          viewerUpSoon: null,
        },
      },
    });

    const row = (await screen.findAllByTestId('lineups__row'))[0];
    /*
     * "Winner of #13" here would name the one team certain NOT to be playing: this fixture
     * is the two semi-finals' losers, and a bench reading it needs that to be unambiguous.
     */
    expect(row).toHaveTextContent('Loser of #13 vs Loser of #14');
    // And it is named, not numbered — "round 2" would read like a route to the trophy.
    expect(row).toHaveTextContent('Third-place match');
  });

  it('shows the projected kick-off chip when the server estimated one (ADR-109)', async () => {
    render({
      'GET /api/tournament/lineups': {
        body: {
          tournament,
          items: [
            fixture({ id: 'fx-1', estimatedStartAt: '2026-10-01T06:45:00.000Z' }),
            fixture({
              id: 'fx-2',
              teamAName: 'Coconuts',
              teamBName: 'Kelong Kings',
              estimatedStartAt: null,
            }),
          ],
          viewerUpSoon: null,
        },
      },
    });

    const chips = await screen.findAllByTestId('lineups__eta');
    // One estimate, one not-yet-estimable (its feeders are unknown): one chip only.
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toMatch(/^~/);
  });

  it('explains the quiet day when no schedule is active', async () => {
    render({ 'GET /api/tournament/lineups': { body: { tournament: null, items: [] } } });
    expect(await screen.findByTestId('lineups__empty')).toHaveTextContent(emptyStates.lineups);
  });

  it('celebrates instead when the schedule finished', async () => {
    render({
      'GET /api/tournament/lineups': {
        body: { tournament: { ...tournament, status: 'completed' }, items: [] },
      },
    });
    expect(await screen.findByTestId('lineups__empty')).toHaveTextContent(emptyStates.lineupsDone);
  });

  it('shows the up-soon banner when the viewer’s fixture is inside the capacity window', async () => {
    render({
      'GET /api/teams/mine': { body: { team: teamFixture } },
      'GET /api/tournament/lineups': {
        body: {
          tournament,
          items: [fixture({ teamAId: teamFixture.id, teamAName: teamFixture.teamName })],
          viewerUpSoon: { fixtureId: 'fx-1', gamesAway: 0 },
        },
      },
    });
    const banner = await screen.findByTestId('lineups__upsoon');
    expect(banner).toHaveTextContent('YOUR TEAM PLAYS SOON');
    expect(screen.getByTestId('lineups__upsoon-detail')).toHaveTextContent(
      'You are up next — head to Court 1!',
    );
  });

  it('counts the matches to go, and switches to in-play wording once the fixture is claimed', async () => {
    render({
      'GET /api/tournament/lineups': {
        body: {
          tournament,
          items: [fixture({ id: 'fx-7', suggestedCourtLabel: null })],
          viewerUpSoon: { fixtureId: 'fx-7', gamesAway: 2 },
        },
      },
    });
    expect(await screen.findByTestId('lineups__upsoon-detail')).toHaveTextContent(
      '2 matches to go. Stay close!',
    );
    stub.restore();

    render({
      'GET /api/tournament/lineups': {
        body: {
          tournament,
          items: [fixture({ id: 'fx-8', status: 'claimed' })],
          viewerUpSoon: { fixtureId: 'fx-8', gamesAway: 0 },
        },
      },
    });
    await waitFor(() =>
      expect(
        screen
          .getAllByTestId('lineups__upsoon-detail')
          .some((node) => node.textContent?.includes('in play now')),
      ).toBe(true),
    );
  });

  it('still counts down when the fixture is not in the visible list', async () => {
    render({
      'GET /api/tournament/lineups': {
        body: {
          tournament,
          items: [fixture({})],
          // One match to go, but the fixture id points outside the delivered page.
          viewerUpSoon: { fixtureId: 'fx-elsewhere', gamesAway: 1 },
        },
      },
    });
    expect(await screen.findByTestId('lineups__upsoon-detail')).toHaveTextContent(
      'One match to go. Stay close!',
    );
  });

  it('shows no banner for a viewer whose team is still deep in the queue', async () => {
    render({
      'GET /api/tournament/lineups': {
        body: { tournament, items: [fixture({})], viewerUpSoon: null },
      },
    });
    await screen.findByTestId('lineups__row');
    expect(screen.queryByTestId('lineups__upsoon')).not.toBeInTheDocument();
  });

  it('offers all three segments of the ball tab', async () => {
    render({ 'GET /api/tournament/lineups': { body: { tournament: null, items: [] } } });
    const links = await screen.findAllByTestId('feed-tabs__link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/feed/results',
      '/feed/lineups',
      // ADR-177 — the agenda joined as a third segment rather than a seventh bottom-nav tab.
      '/feed/agenda',
    ]);
  });

  /*
   * `delayMs` makes the in-flight window real. This asserts the transient 'Refreshing…' hint
   * *after* awaiting the call count, so with an instant stub the refresh has already finished
   * by the time the assertion runs — green alone, red under full-suite load. The delay is the
   * fix: the state being asserted actually exists for long enough to be observed.
   */
  it('reloads the line-ups when the list is pulled down and released (ADR-096)', async () => {
    render({
      'GET /api/tournament/lineups': {
        body: { tournament, items: [fixture({})], viewerUpSoon: null },
        delayMs: 25,
      },
    });
    await screen.findByTestId('lineups__row');
    const before = stub.callsTo('GET /api/tournament/lineups').length;

    const surface = screen.getByTestId('lineups__pull');
    const pullTo = (type: string, clientY: number | null) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', {
        value: clientY === null ? [] : [{ clientY }],
      });
      act(() => {
        surface.dispatchEvent(event);
      });
    };
    pullTo('touchstart', 100);
    pullTo('touchmove', 300);
    expect(screen.getByTestId('lineups__pull-hint').textContent).toBe('Release to refresh');
    pullTo('touchend', null);

    await waitFor(() =>
      expect(stub.callsTo('GET /api/tournament/lineups').length).toBe(before + 1),
    );
    expect(screen.getByTestId('lineups__pull-hint').textContent).toBe('Refreshing…');
  });
});

describe('ADR-321 — dumb mode', () => {
  it('says there are no line-ups, because courts are awarding points instead', async () => {
    render({
      'GET /api/tournament/lineups': { body: { tournament: null, items: [], viewerUpSoon: null, mode: 'dumb' } },
    });
    expect(await screen.findByTestId('lineups__empty')).toHaveTextContent('No match line-ups today');
    expect(screen.queryByTestId('lineups__row')).toBeNull();
  });
});
