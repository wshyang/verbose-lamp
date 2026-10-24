import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyStates } from '@psd/contracts';
import { CourtPage } from '../routes-facilitator/CourtPage.js';
import { renderWithProviders, confirmDialog } from '../test-utils/renderWithProviders.js';
import { installFetchStub } from '../test-utils/fetchStub.js';
import type { FetchStub, RouteTable } from '../test-utils/fetchStub.js';
import { courtConsoleRoutes } from '../test-utils/ambientRoutes.js';
import {
  completedMatchFixture,
  courtFixture,
  facilitatorSession,
  matchFixture,
} from '../test-utils/fixtures.js';

/** fds.md §6.5 — F23 declare a winner from the court console (S23). */

let stub: FetchStub;

afterEach(() => stub?.restore());

function renderCourt(routes: RouteTable) {
  stub = installFetchStub({
    ...courtConsoleRoutes(),
    'GET /api/auth/session': { body: facilitatorSession },
    'GET /api/tournament/courts': { body: { items: [courtFixture] } },
    ...routes,
  });
  renderWithProviders(<CourtPage />, {
    path: '/staff/court/court-1',
    route: '/staff/court/:courtId',
    withSync: true,
  });
}

describe('F23 — declare the winning team', () => {
  it('sends the winning team id and shows both teams as one-tap choices', async () => {
    renderCourt({
      // ADR-152 — hand-picking a winner on 0 - 0 survives only where a draw is illegal.
      'GET /api/tournament/courts/court-1/current-match': {
        body: { match: { ...matchFixture, stage: 'knockout' } },
      },
      'GET /api/teams': { body: { items: [] } },
      'POST /api/tournament/matches/match-1/complete': { body: { match: completedMatchFixture } },
    });

    const buttons = await screen.findAllByTestId('court__winner');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('Sandstorm won');

    const user = userEvent.setup();
    await user.click(buttons[0] as HTMLElement);
    // ADR-027 — points do not move until the marshal confirms.
    expect(stub.callsTo('POST /api/tournament/matches/match-1/complete')).toHaveLength(0);
    expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent('Only a superadmin can undo it');
    await confirmDialog(user);

    await waitFor(() =>
      expect(stub.callsTo('POST /api/tournament/matches/match-1/complete')).toHaveLength(1),
    );
    const [call] = stub.callsTo('POST /api/tournament/matches/match-1/complete');
    // ADR-329 F5 — the complete body always carries the tiebreak, null here: a named winner
    // on an unscored knockout is a choice, not a settle-off-the-scoreboard.
    expect(call?.body).toEqual({ winnerTeamId: 'team-a', tiebreakMethod: null });
  });

  it('blocks starting a match until two teams exist', async () => {
    renderCourt({
      'GET /api/tournament/courts/court-1/current-match': { body: { match: null } },
      'GET /api/teams': { body: { items: [] } },
    });

    expect(await screen.findByTestId('court__needs-teams')).toHaveTextContent(
      emptyStates.facilitatorTeamPicker,
    );
    expect(screen.getByTestId('court__start')).toBeDisabled();
  });

  it('cancels a match without awarding points', async () => {
    renderCourt({
      'GET /api/tournament/courts/court-1/current-match': { body: { match: matchFixture } },
      'GET /api/teams': { body: { items: [] } },
      'POST /api/tournament/matches/match-1/cancel': {
        body: { match: { ...matchFixture, status: 'cancelled' } },
      },
    });

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('court__cancel'));
    await confirmDialog(user);

    await waitFor(() =>
      expect(stub.callsTo('POST /api/tournament/matches/match-1/cancel')).toHaveLength(1),
    );
  });
});
