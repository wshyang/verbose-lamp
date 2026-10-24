import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyStates, messages } from '@psd/contracts';
import { DashboardPage } from './DashboardPage.js';
import { PointConfigPage } from './PointConfigPage.js';
import { ActivitiesPage } from './ActivitiesPage.js';
import { renderWithProviders, confirmDialog } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { activityFixture, superadminSession } from '../test-utils/fixtures.js';
import { superadminShellRoutes } from '../test-utils/ambientRoutes.js';
import { expectEveryFieldDescribed } from '../test-utils/fieldHelpWalk.js';

/**
 * S35, S36, S37–S40 and S41–S43 — the superadmin config console (F32–F38). Spartan, text-only,
 * large buttons: these tests assert the numbers, the states and the copy, never the styling.
 */

let stub: FetchStub;

afterEach(() => stub?.restore());

const dashboardStatus = {
  participantCount: 180,
  teamCount: 24,
  matchCount: 12,
  scanCount: 340,
  courtCount: 4,
  enabledCourtCount: 3,
  activityCount: 6,
  activeActivityCount: 5,
  facilitatorCount: 14,
  superadminCount: 2,
  isPointConfigSet: true,
};

function render(ui: Parameters<typeof renderWithProviders>[0], routes: RouteTable) {
  stub = installFetchStub({
    ...superadminShellRoutes(), 'GET /api/auth/session': { body: superadminSession }, ...routes });
  return renderWithProviders(ui);
}

describe('S35 — event dashboard (F32)', () => {
  it('shows one tile per live count and no checklist once bootstrap is complete', async () => {
    render(<DashboardPage />, { 'GET /api/admin/dashboard': { body: { status: dashboardStatus } } });
    const tiles = await screen.findAllByTestId('dashboard__tile');
    expect(tiles).toHaveLength(8);
    expect(within(tiles[0] as HTMLElement).getByText('180')).toBeVisible();
    expect(screen.getByText('3/4')).toBeVisible();
    expect(screen.queryByTestId('dashboard__blockers')).toBeNull();
  });

  it('lists every outstanding bootstrap step (B6–B7) and refreshes on demand', async () => {
    render(<DashboardPage />, {
      'GET /api/admin/dashboard': {
        body: {
          status: {
            ...dashboardStatus,
            activeActivityCount: 0,
            facilitatorCount: 0,
          },
        },
      },
    });
    const blockers = await screen.findByTestId('dashboard__blockers');
    expect(within(blockers).getAllByRole('listitem')).toHaveLength(2);
    expect(within(blockers).getByText(/B6/)).toBeVisible();

    await userEvent.setup().click(screen.getByTestId('dashboard__refresh'));
    await waitFor(() => expect(stub.callsTo('GET /api/admin/dashboard').length).toBeGreaterThan(1));
  });

  it('reports a failed load instead of an empty console', async () => {
    render(<DashboardPage />, {
      'GET /api/admin/dashboard': {
        status: 401,
        body: { error: { message: messages.signInRequired } },
      },
    });
    expect(await screen.findByText(messages.signInRequired)).toBeVisible();
  });
});

describe('S36 — tournament point values (F35)', () => {
  const pointConfig = {
    fringeParticipationPoints: 5,
    fringePassportBonusPoints: 20,
    fringePassportStations: 4,
    updatedAt: '2026-09-29T02:00:00.000Z',
    updatedByUsername: 'superadmin',
  };

  it('never flashes "Not set yet" at a configured event while the answer loads (ADR-099)', async () => {
    render(<PointConfigPage />, {
      'GET /api/admin/point-config': { body: { pointConfig }, delayMs: 20 },
    });

    // In flight: loading — not the alarm about facilitators being unable to start matches.
    expect(screen.getByTestId('point-config__loading')).toBeVisible();
    expect(screen.queryByTestId('point-config__unset')).toBeNull();

    expect(await screen.findByTestId('point-config__current')).toHaveTextContent('Took part 5');
    expect(screen.queryByTestId('point-config__unset')).toBeNull();
  });

  it('prefills the form from the saved values and writes the fringe numbers back', async () => {
    render(<PointConfigPage />, {
      'GET /api/admin/point-config': { body: { pointConfig } },
      'PUT /api/admin/point-config': { body: { pointConfig: { ...pointConfig, fringeParticipationPoints: 7 } } },
    });
    expect(await screen.findByTestId('point-config__current')).toHaveTextContent('Took part 5');
    await waitFor(() => expect(screen.getByTestId('point-config__participation-points')).toHaveValue('5'));

    const user = userEvent.setup();
    // ADR-116 — the participation floor strips non-digits like the rest.
    await user.clear(screen.getByTestId('point-config__participation-points'));
    await user.type(screen.getByTestId('point-config__participation-points'), '7y');
    // ADR-176 — the passport pair is edited in the same form and strips non-digits too.
    await user.clear(screen.getByTestId('point-config__passport-bonus'));
    await user.type(screen.getByTestId('point-config__passport-bonus'), '2q0');
    await user.clear(screen.getByTestId('point-config__passport-stations'));
    await user.type(screen.getByTestId('point-config__passport-stations'), '5');
    await user.click(screen.getByTestId('point-config__save'));

    await waitFor(() => expect(stub.callsTo('PUT /api/admin/point-config')).toHaveLength(1));
    // Non-digits never reach the field, so the console cannot send a malformed value.
    expect(stub.callsTo('PUT /api/admin/point-config')[0]?.body).toEqual({
      fringeParticipationPoints: 7,
      fringePassportBonusPoints: 20,
      fringePassportStations: 5,
    });
  });

  it('shows the unset notice and saves the fringe defaults', async () => {
    render(<PointConfigPage />, {
      'GET /api/admin/point-config': { body: { pointConfig: null } },
      'PUT /api/admin/point-config': { body: { pointConfig } },
    });
    expect(await screen.findByTestId('point-config__unset')).toHaveTextContent('Not set yet');
    // ADR-116 — the participation floor gets a suggested default like every other value.
    await waitFor(() => expect(screen.getByTestId('point-config__participation-points')).toHaveValue('5'));
    // ADR-176 — the passport is suggested OFF: a bonus nobody asked for must not appear.
    expect(screen.getByTestId('point-config__passport-bonus')).toHaveValue('0');
    expect(screen.getByTestId('point-config__passport-stations')).toHaveValue('4');

    await userEvent.setup().click(screen.getByTestId('point-config__save'));
    await waitFor(() =>
      expect(stub.callsTo('PUT /api/admin/point-config')[0]?.body).toEqual({
        fringeParticipationPoints: 5,
        fringePassportBonusPoints: 0,
        fringePassportStations: 4,
      }),
    );
  });

  it('shows the validation message when the API rejects the values', async () => {
    render(<PointConfigPage />, {
      'GET /api/admin/point-config': { body: { pointConfig } },
      'PUT /api/admin/point-config': {
        status: 400,
        body: { error: { message: messages.participationPointsInvalid, field: 'fringeParticipationPoints' } },
      },
    });
    await waitFor(() => expect(screen.getByTestId('point-config__participation-points')).toHaveValue('5'));
    await userEvent.setup().click(screen.getByTestId('point-config__save'));
    expect(await screen.findByTestId('point-config__error')).toHaveTextContent(
      messages.participationPointsInvalid,
    );
  });
});

describe('S37–S40 — fringe activities (F36–F38)', () => {
  const list = { items: [activityFixture] };

  it('creates an activity from the draft form', async () => {
    render(<ActivitiesPage />, {
      'GET /api/admin/activities': { body: list },
      'POST /api/admin/activities': { status: 201, body: { activity: activityFixture } },
    });
    await screen.findByTestId('activities__name');
    const user = userEvent.setup();
    await user.type(screen.getByTestId('activities__name'), 'Tug of War');
    await user.clear(screen.getByTestId('activities__tier-points'));
    await user.type(screen.getByTestId('activities__tier-points'), '20');
    await user.click(screen.getByTestId('activities__submit'));

    await waitFor(() => expect(stub.callsTo('POST /api/admin/activities')).toHaveLength(1));
    expect(stub.callsTo('POST /api/admin/activities')[0]?.body).toEqual({
      activityName: 'Tug of War',
      awardTiers: [{ label: 'Award', points: 20 }],
    });
  });

  it('switches to edit mode, saves the change and can cancel back out', async () => {
    render(<ActivitiesPage />, {
      'GET /api/admin/activities': { body: list },
      'PUT /api/admin/activities/activity-1': { body: { activity: activityFixture } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('activities__edit'));
    expect(screen.getByTestId('activities__name')).toHaveValue(activityFixture.activityName);
    expect(screen.getByTestId('activities__submit')).toHaveTextContent('Save changes');

    await user.click(screen.getByTestId('activities__submit'));
    await waitFor(() => expect(stub.callsTo('PUT /api/admin/activities/activity-1')).toHaveLength(1));
    expect(stub.callsTo('PUT /api/admin/activities/activity-1')[0]?.body).toEqual({
      activityName: activityFixture.activityName,
      awardTiers: activityFixture.awardTiers,
      isActive: true,
    });

    await user.click(screen.getByTestId('activities__edit'));
    await user.click(screen.getByTestId('activities__cancel'));
    await waitFor(() => expect(screen.getByTestId('activities__name')).toHaveValue(''));
  });

  it('deactivates an activity and reports a duplicate name inline', async () => {
    render(<ActivitiesPage />, {
      'GET /api/admin/activities': { body: list },
      'PATCH /api/admin/activities/activity-1/active': {
        body: { activity: { ...activityFixture, isActive: false } },
      },
      'POST /api/admin/activities': {
        status: 409,
        body: { error: { message: messages.activityNameInvalid, field: 'activityName' } },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('activities__toggle'));
    // ADR-027 — deactivating closes an open round, so it asks first and says so.
    expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent('closes immediately');
    await confirmDialog(user);
    await waitFor(() =>
      expect(stub.callsTo('PATCH /api/admin/activities/activity-1/active')).toHaveLength(1),
    );
    expect(stub.callsTo('PATCH /api/admin/activities/activity-1/active')[0]?.body).toEqual({
      isEnabled: false,
    });

    await user.type(screen.getByTestId('activities__name'), 'Beach Volleyball Rally');
    await user.click(screen.getByTestId('activities__submit'));
    expect(await screen.findByTestId('activities__error')).toHaveTextContent(
      messages.activityNameInvalid,
    );
  });

  it('shows a deactivated activity with no round as inactive', async () => {
    render(<ActivitiesPage />, {
      'GET /api/admin/activities': {
        body: { items: [{ ...activityFixture, isActive: false, currentRound: null }] },
      },
      'PATCH /api/admin/activities/activity-1/active': { body: { activity: activityFixture } },
    });
    const row = await screen.findByTestId('activities__row');
    expect(within(row).getByText('Inactive')).toBeVisible();
    expect(within(row).getByText('—')).toBeVisible();
    expect(screen.getByTestId('activities__toggle')).toHaveTextContent('Activate');

    const activator = userEvent.setup();
    await activator.click(screen.getByTestId('activities__toggle'));
    await confirmDialog(activator);
    await waitFor(() =>
      expect(stub.callsTo('PATCH /api/admin/activities/activity-1/active')[0]?.body).toEqual({
        isEnabled: true,
      }),
    );
  });

  it('uses the FDS empty-state copy before any activity exists (B6)', async () => {
    render(<ActivitiesPage />, { 'GET /api/admin/activities': { body: { items: [] } } });
    expect(await screen.findByText(emptyStates.activityList)).toBeVisible();
  });
});

describe('ADR-092 — the award tier editor', () => {
  it('adds rows up to four, removes one, and submits the full list', async () => {
    render(<ActivitiesPage />, {
      'GET /api/admin/activities': { body: { items: [activityFixture] } },
      'POST /api/admin/activities': { status: 201, body: { activity: activityFixture } },
    });
    await screen.findByTestId('activities__tier-label');
    const user = userEvent.setup();

    await user.click(screen.getByTestId('activities__tier-add'));
    await user.click(screen.getByTestId('activities__tier-add'));
    await user.click(screen.getByTestId('activities__tier-add'));
    expect(screen.getAllByTestId('activities__tier-label')).toHaveLength(4);
    // Four is the ceiling: the add button leaves the page.
    expect(screen.queryByTestId('activities__tier-add')).toBeNull();

    await user.click(screen.getAllByTestId('activities__tier-remove')[3] as HTMLElement);
    expect(screen.getAllByTestId('activities__tier-label')).toHaveLength(3);

    await user.type(screen.getByTestId('activities__name'), 'Sandcastle Sprint');
    const labels = screen.getAllByTestId('activities__tier-label');
    const points = screen.getAllByTestId('activities__tier-points');
    await user.clear(labels[0] as HTMLElement);
    await user.type(labels[0] as HTMLElement, 'First place');
    await user.clear(points[0] as HTMLElement);
    await user.type(points[0] as HTMLElement, '25');
    await user.type(labels[1] as HTMLElement, 'Second place');
    await user.type(labels[2] as HTMLElement, 'Third place');
    await user.click(screen.getByTestId('activities__submit'));

    await waitFor(() => expect(stub.callsTo('POST /api/admin/activities')).toHaveLength(1));
    expect(stub.callsTo('POST /api/admin/activities')[0]?.body).toEqual({
      activityName: 'Sandcastle Sprint',
      awardTiers: [
        { label: 'First place', points: 25 },
        { label: 'Second place', points: 5 },
        { label: 'Third place', points: 5 },
      ],
    });
  });

  it('lists every tier in the activities table', async () => {
    const tiered = {
      ...activityFixture,
      awardTiers: [
        { label: 'First place', points: 25 },
        { label: 'Second place', points: 10 },
      ],
    };
    render(<ActivitiesPage />, { 'GET /api/admin/activities': { body: { items: [tiered] } } });
    const row = await screen.findByTestId('activities__row');
    expect(row).toHaveTextContent('First place +25 · Second place +10');
  });
});

describe('Every field carries its help (ADR-322)', () => {
  it('the point-config form', async () => {
    render(<PointConfigPage />, {
      'GET /api/admin/point-config': { body: { pointConfig: { fringeParticipationPoints: 5, fringePassportBonusPoints: 20, fringePassportStations: 4, updatedAt: '2026-09-29T02:00:00.000Z', updatedByUsername: 'superadmin' } } },
    });
    await screen.findByTestId('point-config__current');
    expectEveryFieldDescribed(document.body, 3);
  });

  it('the activity form, tiers included', async () => {
    render(<ActivitiesPage />, { 'GET /api/admin/activities': { body: { items: [activityFixture] } } });
    await screen.findByTestId('activities__name');
    expectEveryFieldDescribed(document.body, 3);
  });
});
