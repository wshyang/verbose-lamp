import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DumbCourtPage } from './DumbCourtPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { facilitatorShellRoutes } from '../test-utils/ambientRoutes.js';
import { facilitatorSession } from '../test-utils/fixtures.js';

/**
 * ADR-321 — the dumb court console: no line-up, no start button, no score. Arm a tier, tap a
 * team, confirm the Results sentence, and the award lands; the log shows it in the same words
 * participants read, with an Undo while the window is open.
 */

let stub: FetchStub;

afterEach(() => stub?.restore());

const view = {
  courtId: 'court-1',
  courtLabel: 'Court 1',
  tournamentName: 'Dumb Day',
  tiers: [
    { label: 'Played', points: 2 },
    { label: 'Gold', points: 10 },
  ],
  teams: [
    { teamId: 'team-1', teamName: 'Sandstorm', memberCount: 5 },
    { teamId: 'team-2', teamName: 'Wave Riders', memberCount: 4 },
  ],
  awards: [],
  undoWindowSeconds: 10,
};

function renderCourt(awardsAfter: unknown[] = []) {
  let awardedYet = false;
  stub = installFetchStub({
    ...facilitatorShellRoutes(),
    'GET /api/auth/session': { body: facilitatorSession },
    'GET /api/tournament/dumb/courts/court-1': () => ({ body: awardedYet ? { ...view, awards: awardsAfter } : view }),
    'POST /api/tournament/dumb/courts/court-1/awards': () => {
      awardedYet = true;
      return { body: { ...view, awards: awardsAfter } };
    },
  });
  return renderWithProviders(<DumbCourtPage />, { path: '/staff/dumb-court/court-1', route: '/staff/dumb-court/:courtId', withSync: true });
}

const liveAward = {
  id: 'award-1',
  teamId: 'team-1',
  teamName: 'Sandstorm',
  tierLabel: 'Gold',
  points: 10,
  awardedAt: '2026-09-18T01:00:00.000Z',
  awardedByLabel: 'marshal',
  isVoided: false,
  canUndo: true,
};

describe('ADR-321 — the dumb court console', () => {
  it('takes back its own award from the log, and shows a taken-back award struck through', async () => {
    const voidedAward = { ...liveAward, isVoided: true, canUndo: false };
    let voidedYet = false;
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/tournament/dumb/courts/court-1': () => ({ body: voidedYet ? { ...view, awards: [voidedAward] } : { ...view, awards: [liveAward] } }),
      'POST /api/tournament/dumb/awards/award-1/void': () => {
        voidedYet = true;
        return { body: { ...view, awards: [voidedAward] } };
      },
    });
    renderWithProviders(<DumbCourtPage />, { path: '/staff/dumb-court/court-1', route: '/staff/dumb-court/:courtId', withSync: true });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('dumb-court__undo'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Take back' }));
    expect(await screen.findByTestId('dumb-court__outcome')).toHaveTextContent('Award taken back.');
    const row = await screen.findByTestId('dumb-court__log-row');
    expect(within(row).getByText(/taken back/)).toBeVisible();
    expect(within(row).queryByTestId('dumb-court__undo')).toBeNull();
  });

  it('surfaces a refused award as the outcome line instead of paying silently', async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/tournament/dumb/courts/court-1': { body: view },
      'POST /api/tournament/dumb/courts/court-1/awards': { status: 400, body: { error: { message: 'That tier is not part of this tournament.' } } },
    });
    renderWithProviders(<DumbCourtPage />, { path: '/staff/dumb-court/court-1', route: '/staff/dumb-court/:courtId', withSync: true });
    const user = userEvent.setup();
    await user.click((await screen.findAllByTestId('dumb-court__team'))[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Award points' }));
    expect(await screen.findByTestId('dumb-court__outcome')).toHaveTextContent('That tier is not part of this tournament.');
  });

  it('keeps the award standing and says why when an undo is refused', async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/tournament/dumb/courts/court-1': { body: { ...view, awards: [liveAward] } },
      'POST /api/tournament/dumb/awards/award-1/void': { status: 400, body: { error: { message: 'Too late to undo that one.' } } },
    });
    renderWithProviders(<DumbCourtPage />, { path: '/staff/dumb-court/court-1', route: '/staff/dumb-court/:courtId', withSync: true });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('dumb-court__undo'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Take back' }));
    expect(await screen.findByTestId('dumb-court__outcome')).toHaveTextContent('Too late to undo that one.');
  });

  it('says the courts are not running when there is no dumb tournament', async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      'GET /api/auth/session': { body: facilitatorSession },
      'GET /api/tournament/dumb/courts/court-1': { status: 404, body: { error: { message: 'Dumb courts are not running right now.' } } },
    });
    renderWithProviders(<DumbCourtPage />, { path: '/staff/dumb-court/court-1', route: '/staff/dumb-court/:courtId', withSync: true });
    expect(await screen.findByTestId('dumb-court__error')).toHaveTextContent('Dumb courts are not running right now.');
    expect(screen.queryByTestId('dumb-court__team')).toBeNull();
  });

  it('awards the armed tier to a tapped team after naming the sentence in the confirm', async () => {
    const awarded = {
      id: 'award-1',
      teamId: 'team-1',
      teamName: 'Sandstorm',
      tierLabel: 'Gold',
      points: 10,
      awardedAt: '2026-09-18T01:00:00.000Z',
      awardedByLabel: 'marshal',
      isVoided: false,
      canUndo: true,
    };
    renderCourt([awarded]);
    const user = userEvent.setup();
    // Gold is not armed by default (the first tier is): arm it, then tap the team.
    const gold = (await screen.findAllByTestId('dumb-court__tier')).find((button) => button.textContent?.includes('Gold'));
    await user.click(gold!);
    const teams = await screen.findAllByTestId('dumb-court__team');
    await user.click(teams[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Sandstorm is awarded 10 points!/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Award points' }));
    expect(await screen.findByTestId('dumb-court__outcome')).toHaveTextContent('Sandstorm is awarded 10 points!');
    const posts = stub.calls.filter((call) => call.method === 'POST' && call.path.endsWith('/awards'));
    expect(posts).toHaveLength(1);
    const posted = typeof posts[0]?.body === 'string' ? JSON.parse(posts[0].body) : posts[0]?.body;
    expect(posted).toMatchObject({ teamId: 'team-1', tierLabel: 'Gold' });
    // The court's own log reads back in the Results sentence, with an Undo while it can be taken back.
    const row = await screen.findByTestId('dumb-court__log-row');
    expect(within(row).getByText('Sandstorm is awarded 10 points!')).toBeVisible();
    expect(within(row).getByTestId('dumb-court__undo')).toBeVisible();
    // No match machinery leaks into a dumb court.
    expect(screen.queryByText(/start match/i)).toBeNull();
    await waitFor(() => expect(stub.calls.length).toBeGreaterThan(0));
  });
});

describe('Every control group carries its help (ADR-322)', () => {
  it('the tier and team pickers explain themselves', async () => {
    renderCourt();
    await screen.findAllByTestId('dumb-court__tier');
    const tooltips = Array.from(document.querySelectorAll('[role="tooltip"]')).map((n) => n.textContent ?? '');
    expect(tooltips.some((t) => t.includes('armed tier is what the next award pays'))).toBe(true);
    expect(tooltips.some((t) => t.includes('Every member of the team as it stands now is paid'))).toBe(true);
  });
});
