import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { emptyStates, messages } from '@psd/contracts';
import { CourtPage } from './CourtPage.js';
import { FringeStationPage } from './FringeStationPage.js';
import { renderWithProviders, confirmDialog } from '../test-utils/renderWithProviders.js';
import {
  installFetchStub,
  expectNoUnstubbedCalls,
  type FetchStub,
  type RouteTable,
} from '../test-utils/fetchStub.js';
import { expectEveryFieldDescribed } from '../test-utils/fieldHelpWalk.js';
import { SessionProvider } from '../components/shared/SessionProvider.js';
import { SyncProvider } from '../components/shared/SyncProvider.js';
import {
  activityFixture,
  courtFixture,
  facilitatorSession,
  matchFixture,
  participantFixture,
  scanFixture,
  teamFixture,
} from '../test-utils/fixtures.js';

/**
 * S21–S31 — the two station consoles a facilitator lives in all day (F22–F30). One primary
 * action visible at a time, and every scan path ends in an outcome line the facilitator can
 * read at arm's length in the sun.
 */

let stub: FetchStub;

/*
 * ADR-192 — this file is the long-standing flake, so it is the first to assert its own
 * cleanliness. An unstubbed request here would otherwise reject into the void and fail some
 * other test minutes later; now it fails this one, by name, with the route it asked for.
 */
afterEach(() => {
  try {
    expectNoUnstubbedCalls(stub);
  } finally {
    stub?.restore();
  }
});

const otherTeam = { ...teamFixture, id: 'team-b', teamName: 'Wave Riders', joinCode: 'XYZ789' };

/*
 * ADR-192 — the two reads every court console makes, stubbed once for the whole file.
 *
 * `CourtPage` asks for the schedule and for the recent teams on mount, and neither was ever
 * listed. Both therefore rejected on every single render in this file, invisibly: nothing awaits
 * them, so the failures floated free and landed on whichever test the runner was holding when
 * the microtask queue caught up. Alone the file is fast enough that they land harmlessly inside
 * the test that made them; under a loaded full run they slide into a neighbour, which is the
 * wandering flake. Listed here as empty — the same thing the component saw when the request
 * failed — so no behaviour changes, only the silence. Callers still override either one.
 */
const COURT_READS: RouteTable = {
  'GET /api/tournament/schedule': { body: { upNext: [], pendingPairs: [] } },
  [`GET /api/tournament/courts/${courtFixture.id}/recent-teams`]: { body: { teamIds: [] } },
  // ADR-336 §5.4 — the mode read the court page polls.
  'GET /api/tournament/mode': { body: { mode: 'fixtures', isAwarding: false, pendingRequest: null } },
};

function renderCourt(routes: RouteTable) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: facilitatorSession },
    ...COURT_READS,
    ...routes,
  });
  return renderWithProviders(<CourtPage />, {
    path: `/staff/court/${courtFixture.id}`,
    route: '/staff/court/:courtId',
    withSync: true,
  });
}

/**
 * ADR-336 §6.1 — the drain changes which page a court's next visit lands on, so the test needs both
 * destinations in one router. The award screen is a sentinel here: `DumbCourtPage` is exercised by
 * its own file, and all this one is asked is whether the court ends up there.
 */
function renderCourtWithAwardScreen(routes: RouteTable) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: facilitatorSession },
    ...COURT_READS,
    ...routes,
  });
  return render(
    <MemoryRouter initialEntries={[`/staff/court/${courtFixture.id}`]}>
      <SessionProvider>
        <SyncProvider>
          <Routes>
            <Route path="/staff/court/:courtId" element={<CourtPage />} />
            <Route
              path="/staff/dumb-court/:courtId"
              element={<p data-testid="drain-target">Award screen</p>}
            />
          </Routes>
        </SyncProvider>
      </SessionProvider>
    </MemoryRouter>,
  );
}

function renderStation(routes: RouteTable) {
  stub = installFetchStub({ 'GET /api/auth/session': { body: facilitatorSession }, ...routes });
  return renderWithProviders(<FringeStationPage />, {
    path: `/staff/activity/${activityFixture.id}`,
    route: '/staff/activity/:activityId',
    withSync: true,
  });
}

/**
 * ADR-336 §5.4 — the marshal's ask, and the drain that follows the answer.
 *
 * These two live together because they are the same story from the court's side: the marshal asks,
 * and once the desk has switched, the court with nothing on it belongs to the award screen.
 */
describe('ADR-336 — a marshal asks the desk to switch', () => {
  const idleCourt: RouteTable = {
    'GET /api/tournament/courts': { body: { items: [courtFixture] } },
    [`GET /api/tournament/courts/${courtFixture.id}/current-match`]: { body: { match: null } },
    'GET /api/teams': { body: { items: [teamFixture, otherTeam] } },
  };

  it('asks with a reason, and then says whose ask the desk is reading', async () => {
    const pending = {
      id: 'req-1',
      requestedByLabel: 'psdadmin1',
      reason: 'Court 3 is underwater.',
      courtLabel: courtFixture.displayLabel,
      createdAt: '2026-10-15T02:10:00.000Z',
      expiresAt: '2026-10-15T02:20:00.000Z',
    };
    renderCourt({
      ...idleCourt,
      'POST /api/tournament/mode/requests': {
        status: 201,
        body: { mode: 'fixtures', isAwarding: false, pendingRequest: pending },
      },
    });
    const user = userEvent.setup();
    expect(await screen.findByTestId('mode-ask')).toBeVisible();
    expect(screen.getByTestId('mode-ask__submit')).toBeDisabled();

    await user.type(screen.getByTestId('mode-ask__reason'), 'Court 3 is underwater.');
    await user.click(screen.getByTestId('mode-ask__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/tournament/mode/requests')).toHaveLength(1));
    // The court is the one the marshal is standing on; the desk reads it beside the ask.
    expect(stub.callsTo('POST /api/tournament/mode/requests')[0]?.body).toMatchObject({
      reason: 'Court 3 is underwater.',
      courtId: courtFixture.id,
    });
    expect(await screen.findByTestId('mode-ask__pending')).toHaveTextContent(
      'psdadmin1 asked to switch the courts to awarding points',
    );
  });

  it('reads back the desk’s decline with its reason, and is ready to ask again at once', async () => {
    // ADR-342 — the desk declined between presses; the marshal's page reads the reason out loud,
    // and the form never went away: the owner's rule is ask again at once if the room needs it.
    renderCourt({
      ...idleCourt,
      'POST /api/tournament/mode/requests': {
        status: 200,
        body: {
          mode: 'fixtures',
          isAwarding: false,
          pendingRequest: null,
          lastAnswer: {
            id: 'req-7',
            resolution: 'declined',
            declineReason: 'The courts are fine — the puddle is on the path.',
            resolvedAt: '2026-10-15T02:14:00.000Z',
          },
        },
      },
    });
    const user = userEvent.setup();
    expect(await screen.findByTestId('mode-ask')).toBeVisible();
    await user.type(screen.getByTestId('mode-ask__reason'), 'Still raining.');
    await user.click(screen.getByTestId('mode-ask__submit'));
    expect(await screen.findByTestId('mode-ask__declined')).toBeVisible();
    expect(screen.getByTestId('mode-ask__declined-reason')).toHaveTextContent(
      'The courts are fine — the puddle is on the path.',
    );
    // The form is right there under the answer — no reload, no cooldown.
    expect(screen.getByTestId('mode-ask__submit')).toBeVisible();
    await user.click(screen.getByTestId('mode-ask__dismiss'));
    await waitFor(() =>
      expect(screen.queryByTestId('mode-ask__declined')).toBeNull(),
    );
    expect(screen.getByTestId('mode-ask__submit')).toBeVisible();
  });

  it('shows the ask already pending rather than offering a second one', async () => {
    renderCourt({
      ...idleCourt,
      'GET /api/tournament/mode': {
        body: {
          mode: 'fixtures',
          isAwarding: false,
          pendingRequest: {
            id: 'req-9',
            requestedByLabel: 'psdadmin2',
            reason: 'The rain is not stopping.',
            courtLabel: null,
            createdAt: '2026-10-15T02:10:00.000Z',
          },
        },
      },
    });
    expect(await screen.findByTestId('mode-ask__pending')).toHaveTextContent(
      'psdadmin2 asked to switch the courts to awarding points — The rain is not stopping.',
    );
    expect(screen.queryByTestId('mode-ask')).toBeNull();
  });

  it('asks for nothing at all once the courts are awarding, and takes an idle court to the award screen', async () => {
    renderCourtWithAwardScreen({
      ...idleCourt,
      'GET /api/tournament/mode': {
        body: { mode: 'dumb', isAwarding: true, pendingRequest: null },
      },
    });
    // §6.1 — this court has nothing on it, so its next job is awarding, not asking.
    expect(await screen.findByTestId('drain-target')).toBeVisible();
    expect(screen.queryByTestId('mode-ask')).toBeNull();
  });

  it('leaves a court that is still finishing its match where it is', async () => {
    renderCourtWithAwardScreen({
      ...idleCourt,
      [`GET /api/tournament/courts/${courtFixture.id}/current-match`]: {
        body: { match: matchFixture },
      },
      'GET /api/tournament/mode': {
        body: { mode: 'switching', isAwarding: false, pendingRequest: null },
      },
    });
    expect(await screen.findByTestId('court__match-status')).toBeVisible();
    expect(screen.queryByTestId('drain-target')).toBeNull();
  });
});

describe('S21–S24 — court console (F22–F24)', () => {
  const idleCourt: RouteTable = {
    'GET /api/tournament/courts': { body: { items: [courtFixture] } },
    [`GET /api/tournament/courts/${courtFixture.id}/current-match`]: { body: { match: null } },
    'GET /api/teams': { body: { items: [teamFixture, otherTeam] } },
  };

  it('starts a match once two different teams are picked', async () => {
    renderCourt({
      ...idleCourt,
      'POST /api/tournament/matches': { status: 201, body: { match: matchFixture } },
    });
    expect(await screen.findByText(courtFixture.displayLabel)).toBeVisible();
    const user = userEvent.setup();
    expect(screen.getByTestId('court__start')).toBeDisabled();

    await user.selectOptions(screen.getByTestId('court__team-a'), teamFixture.id);
    await user.selectOptions(screen.getByTestId('court__team-b'), teamFixture.id);
    expect(screen.getByTestId('court__start')).toBeDisabled();

    await user.selectOptions(screen.getByTestId('court__team-b'), otherTeam.id);
    await user.click(screen.getByTestId('court__start'));
    await waitFor(() => expect(stub.callsTo('POST /api/tournament/matches')).toHaveLength(1));
    expect(stub.callsTo('POST /api/tournament/matches')[0]?.body).toEqual({
      courtId: courtFixture.id,
      teamAId: teamFixture.id,
      teamBId: otherTeam.id,
    });
  });

  it('pins recent teams on top and keeps the rest one alphabetical list (ADR-097/ADR-100)', async () => {
    const coconuts = { ...teamFixture, id: 'team-c', teamName: 'Coconuts' };
    renderCourt({
      ...idleCourt,
      'GET /api/teams': { body: { items: [coconuts, teamFixture, otherTeam] } },
      [`GET /api/tournament/courts/${courtFixture.id}/recent-teams`]: {
        body: { teamIds: [otherTeam.id, teamFixture.id] },
      },
    });
    const select = await screen.findByTestId('court__team-a');
    // Exactly two groups — recents and everything. No cluster grouping: teams are
    // cross-cluster, so no cluster owns one (ADR-100).
    const groups = within(select).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('label'))).toEqual([
      'Recently on this court',
      'All teams',
    ]);
    // Recents newest first; the full list stays in the API's alphabetical order.
    const recent = within(groups[0] as HTMLElement).getAllByRole('option');
    expect(recent.map((option) => option.textContent)).toEqual([
      otherTeam.teamName,
      teamFixture.teamName,
    ]);
    const all = within(groups[1] as HTMLElement).getAllByRole('option');
    expect(all.map((option) => option.textContent)).toEqual([
      'Coconuts',
      teamFixture.teamName,
      otherTeam.teamName,
    ]);
    // A pinned option is a real option: picking it fills the seat.
    const user = userEvent.setup();
    await user.selectOptions(select, recent[0] as HTMLElement);
    expect(select).toHaveValue(otherTeam.id);
  });

  it('shows a plain ungrouped list before any match has finished on this court (ADR-100)', async () => {
    renderCourt({
      ...idleCourt,
      [`GET /api/tournament/courts/${courtFixture.id}/recent-teams`]: { body: { teamIds: [] } },
    });
    const select = await screen.findByTestId('court__team-a');
    expect(within(select).queryByRole('group')).toBeNull();
    expect(within(select).getByRole('option', { name: teamFixture.teamName })).toBeInTheDocument();
  });

  it('warns when there are not yet two teams to pick from', async () => {
    renderCourt({ ...idleCourt, 'GET /api/teams': { body: { items: [teamFixture] } } });
    expect(await screen.findByTestId('court__needs-teams')).toHaveTextContent(
      emptyStates.facilitatorTeamPicker,
    );
  });

  it('never claims the event has no teams before the teams have loaded (ADR-029)', async () => {
    renderCourt({
      ...idleCourt,
      'GET /api/teams': { body: { items: [teamFixture, { ...teamFixture, id: 'team-b', teamName: 'Wave Riders' }] } },
    });

    // First paint, before any response: the console says it is loading, not that the
    // event is not ready.
    expect(screen.getByTestId('court__loading')).toBeVisible();
    expect(screen.queryByTestId('court__needs-teams')).toBeNull();
    expect(screen.queryByTestId('court__start')).toBeNull();

    // Then the real answer arrives.
    expect(await screen.findByTestId('court__start')).toBeInTheDocument();
    expect(screen.queryByTestId('court__needs-teams')).toBeNull();
    expect(screen.queryByTestId('court__loading')).toBeNull();
  });

  it('declares the winner of the live match (F23)', async () => {
    // ADR-152 — hand-picking survives only where a draw is illegal, so this is a knockout.
    const knockout = { ...matchFixture, stage: 'knockout' as const };
    renderCourt({
      ...idleCourt,
      [`GET /api/tournament/courts/${courtFixture.id}/current-match`]: { body: { match: knockout } },
      [`POST /api/tournament/matches/${matchFixture.id}/complete`]: { body: { match: matchFixture } },
    });
    expect(await screen.findByTestId('court__match-status')).toHaveTextContent(
      `${matchFixture.teamAName} vs ${matchFixture.teamBName}`,
    );
    const winners = screen.getAllByTestId('court__winner');
    expect(winners).toHaveLength(2);
    const user = userEvent.setup();
    await user.click(winners[1] as HTMLElement);
    // ADR-027 — awarding the win asks first.
    expect(screen.getByTestId('confirm-dialog__title')).toHaveTextContent(`${matchFixture.teamBName} won?`);
    await confirmDialog(user);
    await waitFor(() =>
      expect(stub.callsTo(`POST /api/tournament/matches/${matchFixture.id}/complete`)).toHaveLength(1),
    );
    expect(stub.callsTo(`POST /api/tournament/matches/${matchFixture.id}/complete`)[0]?.body).toEqual(
      { winnerTeamId: matchFixture.teamBId, tiebreakMethod: null },
    );
  });

  /*
   * ADR-114 — live scoring. The marshal taps a number and the point is gone to the server
   * before they look up again, so these assert the request that was sent and the number
   * the marshal is left looking at.
   */
  describe('ADR-114 — the live score', () => {
    const scored = { ...matchFixture, scoreA: 7, scoreB: 5 };

    function renderLive(match = scored, extra: RouteTable = {}) {
      return renderCourt({
        ...idleCourt,
        [`GET /api/tournament/courts/${courtFixture.id}/current-match`]: { body: { match } },
        ...extra,
      });
    }

    it('centres each strip on that team\u2019s score and lets only the neighbours be pressed', async () => {
      renderLive();
      expect(await screen.findByTestId('court__score-a')).toHaveTextContent('7');
      expect(screen.getByTestId('court__score-b')).toHaveTextContent('5');

      // Five numbers, centred: the two legal taps are always on screen, so no arrows.
      expect(screen.getByTestId('court__step-a-5')).toBeInTheDocument();
      expect(screen.getByTestId('court__step-a-9')).toBeInTheDocument();
      expect(screen.queryByTestId('court__step-a-10')).toBeNull();

      // Only 6 and 8 are reachable from 7 — one rally forward, one mis-tap back.
      expect(screen.getByTestId('court__step-a-6')).toBeEnabled();
      expect(screen.getByTestId('court__step-a-8')).toBeEnabled();
      expect(screen.getByTestId('court__step-a-7')).toBeDisabled();
      expect(screen.getByTestId('court__step-a-5')).toBeDisabled();
      expect(screen.getByTestId('court__step-a-9')).toBeDisabled();

      // The other side is centred on its own score, independently.
      expect(screen.getByTestId('court__step-b-4')).toBeEnabled();
      expect(screen.getByTestId('court__step-b-6')).toBeEnabled();
      expect(screen.getByTestId('court__step-b-5')).toBeDisabled();
    });

    it('posts the point on the tap itself, naming the score it moved from', async () => {
      renderLive(scored, {
        [`POST /api/tournament/matches/${scored.id}/score`]: {
          body: { match: { ...scored, scoreA: 8 } },
        },
      });
      const user = userEvent.setup();
      await user.click(await screen.findByTestId('court__step-a-8'));

      // No confirm, no submit — one tap is the whole interaction.
      expect(screen.queryByTestId('confirm-dialog__title')).toBeNull();
      await waitFor(() =>
        expect(stub.callsTo(`POST /api/tournament/matches/${scored.id}/score`)).toHaveLength(1),
      );
      expect(stub.callsTo(`POST /api/tournament/matches/${scored.id}/score`)[0]?.body).toEqual({
        side: 'a',
        from: 7,
        to: 8,
      });
    });

    it('keeps the tapped score on screen while a reload still answers with the old one', async () => {
      // The console polls every court on a timer. This is the crossing-in-flight case:
      // the write succeeded, but every read still says 7 — the marshal must NOT watch the
      // point they just scored count itself backwards.
      renderLive(scored, {
        [`POST /api/tournament/matches/${scored.id}/score`]: {
          body: { match: { ...scored, scoreA: 8 } },
        },
      });
      const user = userEvent.setup();
      await user.click(await screen.findByTestId('court__step-a-8'));

      expect(screen.getByTestId('court__score-a')).toHaveTextContent('8');
      await waitFor(() =>
        expect(stub.callsTo(`POST /api/tournament/matches/${scored.id}/score`)).toHaveLength(1),
      );
      // The reload that follows the write re-reads the stale 7 and must not win.
      await waitFor(() =>
        expect(
          stub.callsTo(`GET /api/tournament/courts/${courtFixture.id}/current-match`).length,
        ).toBeGreaterThan(1),
      );
      expect(screen.getByTestId('court__score-a')).toHaveTextContent('8');
      // And the strip has moved with it, so the next rally is still one tap away.
      expect(screen.getByTestId('court__step-a-9')).toBeEnabled();
    });

    it('lets go of the tapped score once a read finally carries it', async () => {
      // The hold must be temporary. Once the server reports the score we tapped, the
      // optimistic value has to be released — otherwise the console would be pinned to
      // its own last tap and could never show a correction made anywhere else.
      renderLive(scored, {
        [`POST /api/tournament/matches/${scored.id}/score`]: {
          body: { match: { ...scored, scoreA: 8 } },
        },
      });
      const user = userEvent.setup();

      // The reload that follows the write will now agree with the tap.
      stub.routes[`GET /api/tournament/courts/${courtFixture.id}/current-match`] = {
        body: { match: { ...scored, scoreA: 8 } },
      };
      await user.click(await screen.findByTestId('court__step-a-8'));
      await waitFor(() => expect(screen.getByTestId('court__score-a')).toHaveTextContent('8'));

      // Now somebody else corrects team A down to 2. A console still clinging to its own
      // 8 would ignore this; a released one shows the truth.
      stub.routes[`GET /api/tournament/courts/${courtFixture.id}/current-match`] = {
        body: { match: { ...scored, scoreA: 2 } },
      };
      stub.routes[`POST /api/tournament/matches/${scored.id}/score`] = {
        body: { match: { ...scored, scoreA: 2, scoreB: 6 } },
      };
      await user.click(screen.getByTestId('court__step-b-6'));

      await waitFor(() => expect(screen.getByTestId('court__score-a')).toHaveTextContent('2'));
    });

    it('scores the right-hand team too, and ends the match to them when they lead', async () => {
      const bAhead = { ...matchFixture, scoreA: 5, scoreB: 7 };
      renderLive(bAhead, {
        [`POST /api/tournament/matches/${bAhead.id}/score`]: {
          body: { match: { ...bAhead, scoreB: 8 } },
        },
      });
      // The ending names the team that is actually ahead, whichever side it sits on.
      expect(await screen.findByTestId('court__end')).toHaveTextContent(bAhead.teamBName);

      const user = userEvent.setup();
      await user.click(screen.getByTestId('court__step-b-8'));
      await waitFor(() =>
        expect(stub.callsTo(`POST /api/tournament/matches/${bAhead.id}/score`)).toHaveLength(1),
      );
      expect(stub.callsTo(`POST /api/tournament/matches/${bAhead.id}/score`)[0]?.body).toEqual({
        side: 'b',
        from: 7,
        to: 8,
      });
    });

    it('gives the point back when the server refuses it, because the console was behind', async () => {
      renderLive(scored, {
        [`POST /api/tournament/matches/${scored.id}/score`]: {
          status: 400,
          body: { error: { message: messages.scoreMovesByOne } },
        },
      });
      const user = userEvent.setup();
      await user.click(await screen.findByTestId('court__step-a-8'));

      expect(await screen.findByTestId('court__error')).toHaveTextContent(messages.scoreMovesByOne);
      // Back to the score the server actually holds, not the one we hoped for.
      await waitFor(() => expect(screen.getByTestId('court__score-a')).toHaveTextContent('7'));
    });

    it('ends the match to the team that is ahead, instead of asking who won', async () => {
      renderLive(scored, {
        [`POST /api/tournament/matches/${scored.id}/complete`]: { body: { match: scored } },
      });
      // The score already says it, so the two "who won" buttons are gone.
      expect(await screen.findByTestId('court__end')).toHaveTextContent(scored.teamAName);
      expect(screen.queryAllByTestId('court__winner')).toHaveLength(0);

      const user = userEvent.setup();
      await user.click(screen.getByTestId('court__end'));
      expect(screen.getByTestId('confirm-dialog__title')).toHaveTextContent('7 - 5');
      await confirmDialog(user);

      await waitFor(() =>
        expect(stub.callsTo(`POST /api/tournament/matches/${scored.id}/complete`)).toHaveLength(1),
      );
      expect(stub.callsTo(`POST /api/tournament/matches/${scored.id}/complete`)[0]?.body).toEqual({
        winnerTeamId: scored.teamAId,
        tiebreakMethod: null,
      });
    });

    it('offers a draw when a level group match can have one (ADR-152)', async () => {
      renderLive({ ...matchFixture, scoreA: 7, scoreB: 7 });
      expect(await screen.findByTestId('court__draw')).toHaveTextContent('Draw');
      expect(screen.queryByTestId('court__end')).toBeNull();
      expect(screen.queryByTestId('court__level')).toBeNull();
      expect(screen.queryAllByTestId('court__winner')).toHaveLength(0);
    });

    it('sends a null winner when the marshal ends a group match as a draw', async () => {
      const level = { ...matchFixture, scoreA: 7, scoreB: 7 };
      renderLive(level, {
        [`POST /api/tournament/matches/${level.id}/complete`]: { body: { match: level } },
      });
      const user = userEvent.setup();
      await user.click(await screen.findByTestId('court__draw'));
      expect(screen.getByTestId('confirm-dialog__title')).toHaveTextContent('Draw at 7 - 7?');
      await confirmDialog(user);
      await waitFor(() =>
        expect(stub.callsTo(`POST /api/tournament/matches/${level.id}/complete`)).toHaveLength(1),
      );
      expect(stub.callsTo(`POST /api/tournament/matches/${level.id}/complete`)[0]?.body).toEqual({
        winnerTeamId: null,
        tiebreakMethod: null,
      });
    });

    it('tells a level knockout match to play on, because it cannot be drawn', async () => {
      renderLive({ ...matchFixture, scoreA: 7, scoreB: 7, stage: 'knockout' });
      expect(await screen.findByTestId('court__level')).toHaveTextContent('cannot be drawn');
      expect(screen.getByTestId('court__level')).toHaveTextContent('play on, or settle it now');
      expect(screen.queryByTestId('court__draw')).toBeNull();
      expect(screen.queryByTestId('court__end')).toBeNull();
      expect(screen.queryAllByTestId('court__winner')).toHaveLength(0);
    });

    it('settles a level knockout by coin toss, naming the winner and keeping the score (ADR-329 F5)', async () => {
      const level = { ...matchFixture, scoreA: 7, scoreB: 7, stage: 'knockout' as const };
      renderLive(level, {
        [`POST /api/tournament/matches/${level.id}/complete`]: { body: { match: level } },
      });
      const user = userEvent.setup();
      expect(await screen.findByTestId('court__tiebreak-method')).toHaveValue('coin_toss');
      const winners = screen.getAllByTestId('court__tiebreak-winner');
      expect(winners).toHaveLength(2);
      await user.click(winners[1] as HTMLElement);
      expect(screen.getByTestId('confirm-dialog__title')).toHaveTextContent('won the coin toss?');
      await confirmDialog(user);
      await waitFor(() =>
        expect(stub.callsTo(`POST /api/tournament/matches/${level.id}/complete`)).toHaveLength(1),
      );
      expect(stub.callsTo(`POST /api/tournament/matches/${level.id}/complete`)[0]?.body).toEqual({
        winnerTeamId: level.teamBId,
        tiebreakMethod: 'coin_toss',
      });
    });

    it('marks a knockout match as undrawable before the score ever goes level', async () => {
      renderLive({ ...matchFixture, scoreA: 3, scoreB: 1, stage: 'knockout' });
      expect(await screen.findByTestId('court__stage')).toHaveTextContent('Knockout match');
      expect(screen.getByTestId('court__stage')).toHaveTextContent('cannot be drawn');
    });

    it('still lets an unscored KNOCKOUT match be awarded by hand, so the bracket cannot deadlock', async () => {
      // ADR-152 — the only survivor of the old 0 - 0 path: a draw is illegal here, and
      // without this the match could never be closed at all.
      renderLive({ ...matchFixture, stage: 'knockout' }, {
        [`POST /api/tournament/matches/${matchFixture.id}/complete`]: {
          body: { match: matchFixture },
        },
      });
      expect(await screen.findByTestId('court__scoreboard')).toBeInTheDocument();
      expect(screen.queryByTestId('court__end')).toBeNull();
      expect(screen.queryByTestId('court__level')).toBeNull();
      const winners = screen.getAllByTestId('court__winner');
      expect(winners).toHaveLength(2);

      const user = userEvent.setup();
      await user.click(winners[0] as HTMLElement);
      expect(screen.getByTestId('confirm-dialog__title')).toHaveTextContent(
        `${matchFixture.teamAName} won?`,
      );
      await confirmDialog(user);
      await waitFor(() =>
        expect(stub.callsTo(`POST /api/tournament/matches/${matchFixture.id}/complete`)).toHaveLength(1),
      );
      expect(
        stub.callsTo(`POST /api/tournament/matches/${matchFixture.id}/complete`)[0]?.body,
      ).toEqual({ winnerTeamId: matchFixture.teamAId, tiebreakMethod: null });
    });
  });

  it('cancels a match without awarding points, and surfaces a refusal', async () => {
    renderCourt({
      ...idleCourt,
      [`GET /api/tournament/courts/${courtFixture.id}/current-match`]: { body: { match: matchFixture } },
      [`POST /api/tournament/matches/${matchFixture.id}/cancel`]: {
        status: 409,
        body: { error: { message: messages.onlyStartingFacilitatorCancels } },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('court__cancel'));
    await confirmDialog(user);
    expect(await screen.findByTestId('court__error')).toHaveTextContent(messages.onlyStartingFacilitatorCancels);
  });
});

describe('ADR-089 — the court console and the schedule', () => {
  const tournament = {
    id: 'tour-1',
    format: 'world_cup',
    status: 'group_stage',
    groupSize: 4,
    advanceCount: 2,
    activatedAt: '2026-10-01T09:00:00.000Z',
  };
  const suggested = {
    id: 'fx-1',
    stage: 'group',
    roundNumber: 1,
    groupCode: 'A',
    sequence: 1,
    teamAId: teamFixture.id,
    teamAName: teamFixture.teamName,
    teamBId: otherTeam.id,
    teamBName: otherTeam.teamName,
    suggestedCourtLabel: courtFixture.displayLabel,
    status: 'pending',
    resolvedWinnerTeamId: null,
  };
  const idleCourt: RouteTable = {
    'GET /api/tournament/courts': { body: { items: [courtFixture] } },
    [`GET /api/tournament/courts/${courtFixture.id}/current-match`]: { body: { match: null } },
    'GET /api/teams': { body: { items: [teamFixture, otherTeam] } },
  };
  const scheduledDay: RouteTable = {
    ...idleCourt,
    'GET /api/tournament/schedule': {
      body: {
        tournament,
        upNext: [suggested],
        pendingPairs: [{ fixtureId: 'fx-1', teamAId: teamFixture.id, teamBId: otherTeam.id }],
      },
    },
  };

  it('offers speed-start buttons: one tap starts exactly that pair (ADR-108)', async () => {
    const third = { ...teamFixture, id: 'team-c', teamName: 'Coconuts' };
    const fourth = { ...teamFixture, id: 'team-d', teamName: 'Kelong Kings' };
    const second = {
      ...suggested,
      id: 'fx-2',
      sequence: 4,
      teamAId: third.id,
      teamAName: third.teamName,
      teamBId: fourth.id,
      teamBName: fourth.teamName,
    };
    renderCourt({
      ...scheduledDay,
      'GET /api/teams': { body: { items: [teamFixture, otherTeam, third, fourth] } },
      'GET /api/tournament/schedule': {
        body: {
          tournament,
          upNext: [suggested, second],
          pendingPairs: [
            { fixtureId: suggested.id, teamAId: suggested.teamAId, teamBId: suggested.teamBId },
            { fixtureId: second.id, teamAId: second.teamAId, teamBId: second.teamBId },
          ],
        },
      },
      'POST /api/tournament/matches': { status: 201, body: { match: matchFixture } },
    });

    const buttons = await screen.findAllByTestId('court__speed-start');
    expect(buttons).toHaveLength(2);
    // The first offer is this court's planned fixture; the rest carry their queue position.
    expect(buttons[0]).toHaveTextContent('Up next here');
    expect(buttons[1]).toHaveTextContent('Coconuts vs Kelong Kings');
    expect(buttons[1]).toHaveTextContent('Queue #4');

    // The marshal taps the pair that is actually standing on the sand — the second one.
    await userEvent.setup().click(buttons[1] as HTMLElement);
    await waitFor(() => expect(stub.callsTo('POST /api/tournament/matches')).toHaveLength(1));
    expect(stub.callsTo('POST /api/tournament/matches')[0]?.body).toEqual({
      courtId: courtFixture.id,
      teamAId: third.id,
      teamBId: fourth.id,
    });
  });

  it('prepopulates the suggested pairing and labels it as on the schedule', async () => {
    renderCourt(scheduledDay);
    await waitFor(() =>
      expect(screen.getByTestId('court__team-a')).toHaveValue(teamFixture.id),
    );
    expect(screen.getByTestId('court__team-b')).toHaveValue(otherTeam.id);
    expect(screen.getByTestId('court__up-next')).toHaveTextContent(
      `Up next here: ${teamFixture.teamName} vs ${otherTeam.teamName}`,
    );
    expect(screen.getByTestId('court__schedule-note')).toHaveTextContent('On the schedule');
  });

  it('never fights an override, and calls the overridden pair a friendly', async () => {
    const third = { ...teamFixture, id: 'team-c', teamName: 'Coconuts' };
    renderCourt({
      ...scheduledDay,
      'GET /api/teams': { body: { items: [teamFixture, otherTeam, third] } },
    });
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByTestId('court__team-b')).toHaveValue(otherTeam.id),
    );
    await user.selectOptions(screen.getByTestId('court__team-b'), 'team-c');
    expect(screen.getByTestId('court__team-b')).toHaveValue('team-c');
    expect(screen.getByTestId('court__schedule-note')).toHaveTextContent('Friendly');
  });

  it('recognises the scheduled pair whichever way round the facilitator picked it', async () => {
    renderCourt(scheduledDay);
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByTestId('court__team-a')).toHaveValue(teamFixture.id),
    );
    // Swap the two seats by hand: still the same unordered pair, still scheduled.
    await user.selectOptions(screen.getByTestId('court__team-a'), otherTeam.id);
    await user.selectOptions(screen.getByTestId('court__team-b'), teamFixture.id);
    expect(screen.getByTestId('court__schedule-note')).toHaveTextContent('On the schedule');
  });

  it('does not prepopulate a knockout slot whose teams are still unknown', async () => {
    renderCourt({
      ...idleCourt,
      'GET /api/tournament/schedule': {
        body: {
          tournament,
          upNext: [{ ...suggested, teamAId: null, teamAName: null, teamBId: null, teamBName: null }],
          pendingPairs: [],
        },
      },
    });
    await waitFor(() => expect(screen.getByTestId('court__up-next')).toBeVisible());
    expect(screen.getByTestId('court__up-next')).toHaveTextContent('TBD vs TBD');
    expect(screen.getByTestId('court__team-a')).toHaveValue('');
  });

  it('stays quiet when no schedule is active', async () => {
    renderCourt({
      ...idleCourt,
      'GET /api/tournament/schedule': {
        body: { tournament: null, upNext: [], pendingPairs: [] },
      },
    });
    await waitFor(() => expect(screen.getByTestId('court__team-a')).toBeVisible());
    expect(screen.queryByTestId('court__up-next')).toBeNull();
    expect(screen.queryByTestId('court__schedule-note')).toBeNull();
  });
});

describe('S25–S31 — fringe station (F26–F30)', () => {
  const openRound = {
    id: 'round-1',
    activityId: activityFixture.id,
    roundNumber: 1,
    status: 'open' as const,
    openedAt: '2026-09-29T02:00:00.000Z',
    closedAt: null,
    scanCount: 1,
  };
  const activityWithRound = { ...activityFixture, currentRound: openRound };

  const liveStation: RouteTable = {
    [`GET /api/fringe/activities/${activityFixture.id}`]: { body: { activity: activityWithRound } },
    [`GET /api/fringe/rounds/${openRound.id}/scans`]: { body: { items: [scanFixture] } },
  };

  const byNumber = `GET /api/staff/participants/by-number/${participantFixture.scanNumber}`;

  function setLink(isOnline: boolean): void {
    // The house idiom (useIsOnline.test.ts): `navigator.onLine` is read-only, so redefine it.
    Object.defineProperty(navigator, 'onLine', { value: isOnline, configurable: true });
  }

  beforeEach(() => {
    window.localStorage.clear();
    setLink(true);
  });

  it('resolves a typed number, confirms the NICKNAME, then awards (F27/F28, ADR-088)', async () => {
    renderStation({
      ...liveStation,
      [byNumber]: { body: { participant: participantFixture } },
      'POST /api/fringe/scans': {
        status: 201,
        body: { scan: { ...scanFixture, pointsAwardedSnapshot: 15 }, duplicate: false },
      },
    });
    expect(await screen.findByTestId('fringe__log-row')).toHaveTextContent(
      scanFixture.participantNickname,
    );
    expect(screen.getByTestId('fringe__scan-count')).toHaveTextContent('1 scans');

    // The fourth digit is the submit (ADR-085) — no extra tap between typing and the dialog.
    const user = userEvent.setup();
    await user.type(screen.getByTestId('fringe__number'), participantFixture.scanNumber);

    // The dialog leads with the nickname: that is the fact checked against the human present.
    expect(await screen.findByTestId('confirm-dialog__title')).toHaveTextContent(
      `Award +15 to ${participantFixture.nickname}?`,
    );
    expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent(
      participantFixture.scanNumber,
    );
    await confirmDialog(user);

    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent(
      participantFixture.nickname,
    );
    expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(1);
    expect(screen.getByTestId('fringe__number')).toHaveValue('');
  });

  // ADR-138 — the undo sits next to the confirmation, not in a menu: ten seconds is not
  // enough time to go looking for it.
  it('offers an undo beside the confirmation and takes the points back', async () => {
    renderStation({
      ...liveStation,
      [byNumber]: { body: { participant: participantFixture } },
      'POST /api/fringe/scans': { status: 201, body: { scan: scanFixture, duplicate: false } },
      [`POST /api/fringe/scans/${scanFixture.id}/undo`]: {
        body: { scan: { ...scanFixture, isVoided: true, undoneAt: '2026-09-29T02:05:06.000Z' } },
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('fringe__number'), participantFixture.scanNumber);
    await confirmDialog(user);

    const undo = await screen.findByTestId('fringe__undo');
    expect(undo).toHaveTextContent(/Undo \(\d+s\)/);
    await user.click(undo);

    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent(messages.scanUndone);
    expect(stub.callsTo(`POST /api/fringe/scans/${scanFixture.id}/undo`)).toHaveLength(1);
    // The offer goes with the scan it belonged to: nothing left to take back.
    expect(screen.queryByTestId('fringe__undo')).toBeNull();
  });

  it('reports a duplicate scan as already counted, without awarding twice', async () => {
    renderStation({
      ...liveStation,
      [byNumber]: { body: { participant: participantFixture } },
      'POST /api/fringe/scans': { body: { scan: scanFixture, duplicate: true } },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('fringe__number'), participantFixture.scanNumber);
    await confirmDialog(user);
    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent(/already/i);
  });

  it('keeps the typed digits next to the not-found message, for checking against the badge', async () => {
    renderStation({
      ...liveStation,
      'GET /api/staff/participants/by-number/9999': {
        status: 404,
        body: { error: { message: messages.scanNumberNotFound } },
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('fringe__number'), '9999');

    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent(
      messages.scanNumberNotFound,
    );
    // The evidence stays: the facilitator compares the field with the badge, then corrects it.
    expect(screen.getByTestId('fringe__number')).toHaveValue('9999');
    expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(0);
  });

  it('refuses an incomplete number before it reaches the API', async () => {
    renderStation(liveStation);
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('fringe__number'), '07');
    await user.click(screen.getByTestId('fringe__lookup'));
    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent(
      messages.scanNumberInvalid,
    );
    const lookupCalls = stub.calls.filter((call) => call.path.includes('/by-number/'));
    expect(lookupCalls).toHaveLength(0);
    expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(0);
  });

  it('disables manual entry offline — the QR path is the offline path (ADR-088)', async () => {
    setLink(false);
    renderStation(liveStation);

    const field = await screen.findByTestId('fringe__number');
    expect(field).toBeDisabled();
    expect(screen.getByTestId('fringe__lookup')).toBeDisabled();
    expect(screen.getByTestId('fringe__manual-offline')).toHaveTextContent(
      messages.manualEntryOffline,
    );
  });

  it('advances to the next round and ends the round from the live controls', async () => {
    renderStation({
      ...liveStation,
      [`POST /api/fringe/rounds/${openRound.id}/advance`]: {
        status: 201,
        body: { round: { ...openRound, id: 'round-2', roundNumber: 2 } },
      },
      [`POST /api/fringe/rounds/${openRound.id}/end`]: {
        body: { round: { ...openRound, status: 'ended' } },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('fringe__advance'));
    await confirmDialog(user);
    await waitFor(() =>
      expect(stub.callsTo(`POST /api/fringe/rounds/${openRound.id}/advance`)).toHaveLength(1),
    );
    await user.click(screen.getByTestId('fringe__end'));
    // ADR-027 — closing the station asks first, and says the scans keep their points.
    expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent('keep their points');
    await confirmDialog(user);
    await waitFor(() =>
      expect(stub.callsTo(`POST /api/fringe/rounds/${openRound.id}/end`)).toHaveLength(1),
    );
  });

  it('does not offer to open a round that is already open (ADR-029)', async () => {
    renderStation({
      [`GET /api/fringe/activities/${activityFixture.id}`]: {
        body: { activity: { ...activityFixture, currentRound: openRound } },
      },
      [`GET /api/fringe/rounds/${openRound.id}/scans`]: { body: { items: [] } },
    });

    // The station used to open on a disabled "Open round 1" while round 1 was live.
    expect(screen.getByTestId('fringe__loading')).toBeVisible();
    expect(screen.queryByTestId('fringe__open-round')).toBeNull();

    expect(await screen.findByTestId('fringe__number')).toBeInTheDocument();
    expect(screen.queryByTestId('fringe__open-round')).toBeNull();
    expect(screen.queryByTestId('fringe__loading')).toBeNull();
  });

  it('opens round 1 when nothing is open yet, and shows the empty log copy', async () => {
    renderStation({
      [`GET /api/fringe/activities/${activityFixture.id}`]: {
        body: { activity: { ...activityFixture, currentRound: null } },
      },
      [`POST /api/fringe/activities/${activityFixture.id}/rounds`]: {
        status: 201,
        body: { round: openRound },
      },
    });
    expect(await screen.findByText(emptyStates.currentRoundScanLog)).toBeVisible();
    expect(screen.getByTestId('fringe__open-round')).toHaveTextContent('Open round 1');
    await userEvent.setup().click(screen.getByTestId('fringe__open-round'));
    await waitFor(() =>
      expect(stub.callsTo(`POST /api/fringe/activities/${activityFixture.id}/rounds`)).toHaveLength(1),
    );
  });

  it('offers to reopen an ended round or open the next one (F30)', async () => {
    const endedRound = { ...openRound, status: 'ended' as const, closedAt: '2026-09-29T02:40:00.000Z' };
    renderStation({
      [`GET /api/fringe/activities/${activityFixture.id}`]: {
        body: { activity: { ...activityFixture, currentRound: endedRound } },
      },
      [`GET /api/fringe/rounds/${endedRound.id}/scans`]: { body: { items: [] } },
      [`POST /api/fringe/rounds/${endedRound.id}/reactivate`]: { body: { round: openRound } },
    });
    expect(await screen.findByTestId('fringe__open-round')).toHaveTextContent('Open round 2');
    const reopen = userEvent.setup();
    await reopen.click(screen.getByTestId('fringe__reactivate'));
    await confirmDialog(reopen);
    await waitFor(() =>
      expect(stub.callsTo(`POST /api/fringe/rounds/${endedRound.id}/reactivate`)).toHaveLength(1),
    );
  });

  it('blocks opening a round on a deactivated activity and says so', async () => {
    renderStation({
      [`GET /api/fringe/activities/${activityFixture.id}`]: {
        body: { activity: { ...activityFixture, isActive: false, currentRound: null } },
      },
    });
    expect(await screen.findByText(/activity inactive/)).toBeVisible();
    expect(screen.getByTestId('fringe__open-round')).toBeDisabled();
  });

  it('routes typing from anywhere on the page into the number box (ADR-105)', async () => {
    renderStation(liveStation);
    const box = await screen.findByTestId('fringe__number');

    /*
     * The two preconditions are asserted rather than assumed, because this test has failed
     * once under full-suite load and could not be reproduced in fifteen attempts afterwards
     * (three full runs, twelve standalone under four-way CPU starvation). `toHaveFocus()`
     * failing says only "the box is not focused", which is the one thing already known — and
     * `useTypeAnywhere` has exactly two reasons to decline, both of them correct behaviour:
     * the box is disabled (the station reads itself as offline), or a confirm dialog is up and
     * keys must not leak under it. Naming them here means the next occurrence reports WHICH,
     * instead of leaving the next person where this one started.
     *
     * This does not weaken the test: the assertion that matters is unchanged below.
     */
    expect(box).toBeEnabled();
    expect(screen.queryByTestId('confirm-dialog__title')).toBeNull();

    // No tap, no focus ring hunted: a key pressed on the page body lands the box focus —
    // which is also exactly what a hardware scan gun's keystrokes need.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));

    expect(box).toHaveFocus();
  });

  it('points the facilitator at the 4-digit number when the device has no camera (ADR-088)', async () => {
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    renderStation(liveStation);
    await userEvent.setup().click(await screen.findByTestId('fringe__camera-start'));
    expect(await screen.findByText(/type their 4-digit number instead/)).toBeVisible();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: original });
  });

  it('starts and stops the camera when one is available (F26)', async () => {
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
    await user.click(await screen.findByTestId('fringe__camera-start'));
    await waitFor(() => expect(screen.getByTestId('fringe__camera-stop')).toBeEnabled());
    await user.click(screen.getByTestId('fringe__camera-stop'));
    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByTestId('fringe__camera-start')).toBeEnabled();

    HTMLMediaElement.prototype.play = play;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: original });
  });

  it('reports an activity that cannot be loaded', async () => {
    renderStation({
      [`GET /api/fringe/activities/${activityFixture.id}`]: {
        status: 404,
        body: { error: { message: messages.activityNotFound } },
      },
    });
    expect(await screen.findByTestId('fringe__error')).toHaveTextContent(messages.activityNotFound);
  });
});

describe('ADR-092 — tier arming on the station console', () => {
  const tieredActivity = {
    ...activityFixture,
    awardTiers: [
      { label: 'First place', points: 25 },
      { label: 'Second place', points: 10 },
    ],
  };

  it('arms a tier, promises it in the dialog, posts it, flashes green on the award', async () => {
    renderStation({
      'GET /api/fringe/activities/activity-1': { body: { activity: tieredActivity } },
      'GET /api/fringe/rounds/round-1/scans': { body: { items: [] } },
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        body: { participant: participantFixture },
      },
      'POST /api/fringe/scans': {
        status: 201,
        body: {
          scan: { ...scanFixture, pointsAwardedSnapshot: 10, tierLabelSnapshot: 'Second place' },
          duplicate: false,
        },
      },
    });

    const tierButtons = await screen.findAllByTestId('fringe__tier');
    expect(tierButtons).toHaveLength(2);
    expect(screen.getByTestId('fringe__armed')).toHaveTextContent('First place +25');
    expect(screen.queryByTestId('fringe__flash')).toBeNull();

    const user = userEvent.setup();
    await user.click(tierButtons[1] as HTMLElement);
    expect(screen.getByTestId('fringe__armed')).toHaveTextContent('Next scan: Second place +10 pts');
    expect(tierButtons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(tierButtons[0]).toHaveAttribute('aria-pressed', 'false');

    await user.type(screen.getByTestId('fringe__number'), participantFixture.scanNumber);
    expect(await screen.findByTestId('confirm-dialog__title')).toHaveTextContent(
      `Award Second place +10 to ${participantFixture.nickname}?`,
    );
    await confirmDialog(user);

    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent(
      '+10 pts · Second place',
    );
    expect(stub.callsTo('POST /api/fringe/scans')[0]?.body).toMatchObject({
      tierLabel: 'Second place',
    });
    // The whole screen celebrates a server-acknowledged award (ADR-092).
    expect(screen.getByTestId('fringe__flash')).toBeInTheDocument();
  });

  /**
   * ADR-116 — the gap this closes. A podium-only station had no tier for somebody who simply
   * took part, so they could not be recorded at all. The control is always offered, and the
   * station names the award rather than pricing it: the server owns the number.
   */
  it('ADR-116: offers the participation award at a placings-only station', async () => {
    renderStation({
      'GET /api/fringe/activities/activity-1': {
        body: { activity: tieredActivity, participationPoints: 5 },
      },
      'GET /api/fringe/rounds/round-1/scans': { body: { items: [] } },
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        body: { participant: participantFixture },
      },
      'POST /api/fringe/scans': {
        status: 201,
        body: {
          scan: { ...scanFixture, pointsAwardedSnapshot: 5, tierLabelSnapshot: 'Took part' },
          duplicate: false,
        },
      },
    });

    const user = userEvent.setup();
    const participation = await screen.findByTestId('fringe__participation');
    expect(participation).toHaveTextContent('Took part +5');
    await user.click(participation);
    expect(screen.getByTestId('fringe__armed')).toHaveTextContent('Next scan: Took part +5 pts');

    await user.type(screen.getByTestId('fringe__number'), participantFixture.scanNumber);
    expect(await screen.findByTestId('confirm-dialog__title')).toHaveTextContent(
      `Award Took part +5 to ${participantFixture.nickname}?`,
    );
    await confirmDialog(user);

    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent('+5 pts · Took part');
    // null, not a label: the station cannot price participation, so it does not try.
    expect(stub.callsTo('POST /api/fringe/scans')[0]?.body).toMatchObject({ tierLabel: null });
  });

  /**
   * ADR-116 — the sequence that used to lose points. A held slot answered 200 and discarded
   * the new award; now it reports the clash and offers the overwrite.
   */
  it('ADR-116: a held slot offers a replacement instead of swallowing the award', async () => {
    renderStation({
      'GET /api/fringe/activities/activity-1': {
        body: { activity: tieredActivity, participationPoints: 5 },
      },
      'GET /api/fringe/rounds/round-1/scans': { body: { items: [] } },
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        body: { participant: participantFixture },
      },
      // First attempt clashes; the replacement that follows it succeeds.
      'POST /api/fringe/scans': (() => {
        let attempts = 0;
        return () => {
          attempts += 1;
          if (attempts === 1) {
            return { status: 409, body: { error: { message: messages.scanSlotHeld } } };
          }
          return {
            status: 201,
            body: {
              scan: {
                ...scanFixture,
                pointsAwardedSnapshot: 25,
                tierLabelSnapshot: 'First place',
              },
              duplicate: false,
            },
          };
        };
      })(),
    });

    const user = userEvent.setup();
    await user.type(await screen.findByTestId('fringe__number'), participantFixture.scanNumber);
    await confirmDialog(user);

    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent(
      messages.scanSlotHeld,
    );
    const replace = await screen.findByTestId('fringe__replace');
    expect(replace).toHaveTextContent(`Replace award for ${participantFixture.nickname}`);

    await user.click(replace);
    expect(await screen.findByTestId('fringe__outcome')).toHaveTextContent('+25 pts');
    expect(stub.callsTo('POST /api/fringe/scans')[1]?.body).toMatchObject({
      replaceExisting: true,
    });
  });

  it('hides the arming row on a flat-rate station and summarises tiers in the header', async () => {
    renderStation({
      'GET /api/fringe/activities/activity-1': { body: { activity: tieredActivity } },
      'GET /api/fringe/rounds/round-1/scans': { body: { items: [] } },
    });
    expect(await screen.findByText('First place +25 · Second place +10')).toBeVisible();
  });
});

describe('Every facilitator field carries its help (ADR-322)', () => {
  it('the court team pickers', async () => {
    renderCourt({
      'GET /api/tournament/courts': { body: { items: [courtFixture] } },
      [`GET /api/tournament/courts/${courtFixture.id}/current-match`]: { body: { match: null } },
      'GET /api/teams': { body: { items: [teamFixture, otherTeam] } },
      'GET /api/tournament/dumb/status': { body: { active: false } },
    });
    await screen.findByTestId('court__team-a');
    expectEveryFieldDescribed(document.body, 2);
  });
});
