import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyStates, messages } from '@psd/contracts';
import { ClustersPage } from './ClustersPage.js';
import { FacilitatorsPage } from './FacilitatorsPage.js';
import { SuperadminsPage } from './SuperadminsPage.js';
import { ParticipantsPage } from './ParticipantsPage.js';
import { ParticipantDetailPage } from './ParticipantDetailPage.js';
import { TeamsDirectoryPage } from './TeamsDirectoryPage.js';
import { AuditPage } from './AuditPage.js';
import { ScansPage } from './ScansPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { adminConsoleRoutes } from '../test-utils/ambientRoutes.js';
import { expectEveryFieldDescribed } from '../test-utils/fieldHelpWalk.js';
import {
  activityFixture,
  courtFixture,
  participantFixture,
  scanFixture,
  superadminSession,
  teamFixture,
} from '../test-utils/fixtures.js';

/**
 * S44–S59 — staff accounts, the directories and the correction desks. Every correction here
 * is reversible and reason-bearing (fds.md §7.10), which is what these tests pin down.
 */

let stub: FetchStub;

afterEach(() => stub?.restore());

const facilitatorRow = {
  id: 'facilitator-1',
  username: 'court1',
  displayLabel: 'Court marshal',
  defaultStationType: 'court' as const,
  defaultStationId: courtFixture.id,
  defaultStationLabel: courtFixture.displayLabel,
  lastLoginAt: '2026-09-29T02:00:00.000Z',
  createdAt: '2026-09-29T01:00:00.000Z',
};

function render(
  ui: Parameters<typeof renderWithProviders>[0],
  routes: RouteTable,
  options?: { path: string; route: string },
) {
  stub = installFetchStub({
    ...adminConsoleRoutes(), 'GET /api/auth/session': { body: superadminSession }, ...routes });
  return renderWithProviders(ui, options);
}

describe('S44–S46 — facilitator accounts (F39/F40)', () => {
  const baseRoutes: RouteTable = {
    'GET /api/admin/facilitators': { body: { items: [facilitatorRow] } },
    'GET /api/admin/courts': { body: { items: [courtFixture] } },
    // ADR-285 — the station picker's courts come from the tournament console read.
    'GET /api/admin/tournament': { body: { courts: [{ id: courtFixture.id, courtNumber: 1, label: courtFixture.displayLabel, isEnabled: true }], tournament: null, teams: [] } },
    'GET /api/admin/activities': { body: { items: [activityFixture] } },
  };

  it('creates an account with a fringe station picked from the live activity list', async () => {
    render(<FacilitatorsPage />, {
      ...baseRoutes,
      'POST /api/admin/facilitators': { status: 201, body: { facilitator: facilitatorRow } },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('facilitators__username'), 'fringe2');
    await user.type(screen.getByTestId('facilitators__passcode'), '1357');
    await user.type(screen.getByTestId('facilitators__label'), 'Fringe 2 lead');
    await user.selectOptions(screen.getByTestId('facilitators__station-type'), 'fringe_activity');
    await waitFor(() =>
      expect(screen.getByTestId('facilitators__station-id')).not.toBeDisabled(),
    );
    await user.selectOptions(screen.getByTestId('facilitators__station-id'), activityFixture.id);
    await user.click(screen.getByTestId('facilitators__submit'));

    await waitFor(() => expect(stub.callsTo('POST /api/admin/facilitators')).toHaveLength(1));
    expect(stub.callsTo('POST /api/admin/facilitators')[0]?.body).toEqual({
      username: 'fringe2',
      passcode: '1357',
      displayLabel: 'Fringe 2 lead',
      defaultStationType: 'fringe_activity',
      defaultStationId: activityFixture.id,
    });
  });

  it('offers fringe activities when the station type is a fringe activity', async () => {
    render(<FacilitatorsPage />, baseRoutes);
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId('facilitators__station-type'),
      'fringe_activity',
    );
    await waitFor(() =>
      expect(screen.getByRole('option', { name: activityFixture.activityName })).toBeVisible(),
    );
  });

  it('edits an account, keeps the passcode when left blank and locks the username', async () => {
    render(<FacilitatorsPage />, {
      ...baseRoutes,
      'PUT /api/admin/facilitators/facilitator-1': { body: { facilitator: facilitatorRow } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('facilitators__edit'));
    expect(screen.getByTestId('facilitators__username')).toBeDisabled();
    expect(screen.getByTestId('facilitators__passcode')).toHaveValue('');

    await user.click(screen.getByTestId('facilitators__submit'));
    await waitFor(() =>
      expect(stub.callsTo('PUT /api/admin/facilitators/facilitator-1')).toHaveLength(1),
    );
    expect(stub.callsTo('PUT /api/admin/facilitators/facilitator-1')[0]?.body).toEqual({
      displayLabel: 'Court marshal',
      defaultStationType: 'court',
      defaultStationId: courtFixture.id,
    });

    await user.click(screen.getByTestId('facilitators__edit'));
    await user.click(screen.getByTestId('facilitators__cancel'));
    await waitFor(() => expect(screen.getByTestId('facilitators__username')).toBeEnabled());
  });

  it('renders an account with no label, station or sign-in yet', async () => {
    render(<FacilitatorsPage />, {
      ...baseRoutes,
      'GET /api/admin/facilitators': {
        body: {
          items: [
            {
              ...facilitatorRow,
              id: 'facilitator-2',
              username: 'spare1',
              displayLabel: null,
              defaultStationType: 'none' as const,
              defaultStationId: null,
              defaultStationLabel: null,
              lastLoginAt: null,
            },
          ],
        },
      },
      'PUT /api/admin/facilitators/facilitator-2': { body: { facilitator: facilitatorRow } },
    });
    const row = await screen.findByTestId('facilitators__row');
    expect(within(row).getByText('Unassigned')).toBeVisible();
    expect(within(row).getByText('Never')).toBeVisible();

    // Editing it leaves every optional field explicitly empty.
    const user = userEvent.setup();
    await user.click(screen.getByTestId('facilitators__edit'));
    expect(screen.getByTestId('facilitators__station-id')).toBeDisabled();
    await user.selectOptions(screen.getByTestId('facilitators__station-type'), 'court');
    await user.click(screen.getByTestId('facilitators__submit'));
    await waitFor(() =>
      expect(stub.callsTo('PUT /api/admin/facilitators/facilitator-2')).toHaveLength(1),
    );
    expect(stub.callsTo('PUT /api/admin/facilitators/facilitator-2')[0]?.body).toEqual({
      displayLabel: null,
      defaultStationType: 'court',
      defaultStationId: null,
    });
  });

  it('signs the superadmin out of the console', async () => {
    render(<FacilitatorsPage />, {
      ...baseRoutes,
      'POST /api/auth/signout': { body: { ok: true } },
    });
    await screen.findByTestId('facilitators__row');
    await userEvent.setup().click(screen.getByTestId('console-shell__signout'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/signout')).toHaveLength(1));
  });

  /*
   * ADR-167 — the staff half of the same rule: a sign-out the server never confirmed has not
   * happened, and the console must say so instead of navigating away from a session that is
   * still very much alive.
   */
  it('says so when the console sign-out never reached the server (ADR-167)', async () => {
    render(<FacilitatorsPage />, {
      ...baseRoutes,
      'POST /api/auth/signout': { offline: true },
    });
    await screen.findByTestId('facilitators__row');
    await userEvent.setup().click(screen.getByTestId('console-shell__signout'));

    expect(await screen.findByTestId('console-shell__signout-failed')).toBeVisible();
    expect(screen.getByTestId('console-shell__signout')).toBeVisible();
  });

  it('reports a duplicate username and shows the empty state when there are none (B7)', async () => {
    render(<FacilitatorsPage />, {
      ...baseRoutes,
      'POST /api/admin/facilitators': {
        status: 409,
        body: { error: { message: messages.usernameInvalid, field: 'username' } },
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('facilitators__username'), 'court1');
    await user.type(screen.getByTestId('facilitators__passcode'), '1111');
    await user.click(screen.getByTestId('facilitators__submit'));
    expect(await screen.findByTestId('facilitators__error')).toHaveTextContent(
      messages.usernameInvalid,
    );

    stub.restore();
    render(<FacilitatorsPage />, { ...baseRoutes, 'GET /api/admin/facilitators': { body: { items: [] } } });
    expect(await screen.findByText(emptyStates.facilitatorList)).toBeVisible();
  });
});

describe('S57–S59 — superadmin accounts', () => {
  const superadminRow = {
    id: 'superadmin-1',
    username: 'superadmin',
    createdAt: '2026-09-29T00:00:00.000Z',
    lastLoginAt: null,
  };

  it('creates a second superadmin', async () => {
    render(<SuperadminsPage />, {
      'GET /api/admin/superadmins': { body: { items: [superadminRow] } },
      'POST /api/admin/superadmins': { status: 201, body: { superadmin: superadminRow } },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('superadmins__username'), 'director');
    await user.type(screen.getByTestId('superadmins__passcode'), '2468');
    await user.click(screen.getByTestId('superadmins__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/admin/superadmins')).toHaveLength(1));
    expect(stub.callsTo('POST /api/admin/superadmins')[0]?.body).toEqual({
      username: 'director',
      passcode: '2468',
    });
    expect(screen.getByText('Never')).toBeVisible();
  });

  it('rotates a passcode through the confirmation dialog, and can back out', async () => {
    render(<SuperadminsPage />, {
      'GET /api/admin/superadmins': {
        body: { items: [{ ...superadminRow, lastLoginAt: '2026-09-29T01:30:00.000Z' }] },
      },
      'PUT /api/admin/superadmins/superadmin-1/passcode': { body: { superadmin: superadminRow } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('superadmins__rotate'));
    await user.click(screen.getByTestId('superadmins__rotate-cancel'));
    expect(screen.queryByTestId('superadmins__rotate-passcode')).toBeNull();

    await user.click(screen.getByTestId('superadmins__rotate'));
    await user.type(screen.getByTestId('superadmins__rotate-passcode'), '9753');
    await user.click(screen.getByTestId('superadmins__rotate-confirm'));
    await waitFor(() =>
      expect(stub.callsTo('PUT /api/admin/superadmins/superadmin-1/passcode')).toHaveLength(1),
    );
    expect(stub.callsTo('PUT /api/admin/superadmins/superadmin-1/passcode')[0]?.body).toEqual({
      passcode: '9753',
    });
  });

  it('shows the API error when a username is taken', async () => {
    render(<SuperadminsPage />, {
      'GET /api/admin/superadmins': { body: { items: [superadminRow] } },
      'POST /api/admin/superadmins': {
        status: 409,
        body: { error: { message: messages.usernameInvalid, field: 'username' } },
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('superadmins__username'), 'superadmin');
    await user.type(screen.getByTestId('superadmins__passcode'), '1111');
    await user.click(screen.getByTestId('superadmins__submit'));
    expect(await screen.findByTestId('superadmins__error')).toHaveTextContent(
      messages.usernameInvalid,
    );
  });
});

describe('S52–S54 — directories (F49/F50)', () => {
  const directoryRow = { participant: participantFixture, teamName: 'Sandstorm' };

  it('searches participants and links through to the detail page', async () => {
    render(<ParticipantsPage />, {
      'GET /api/admin/participants': { body: { items: [directoryRow] } },
    });
    expect(await screen.findByTestId('participants__row')).toBeVisible();
    expect(screen.getByTestId('participants__detail')).toHaveAttribute(
      'href',
      `/admin/participants/${participantFixture.id}`,
    );

    const user = userEvent.setup();
    await user.type(screen.getByTestId('participants__search'), 'Beach');
    await user.click(screen.getByTestId('participants__search-submit'));
    await waitFor(() =>
      expect(
        stub.calls.some((call) => call.path.includes('search=Beach')),
      ).toBe(true),
    );
  });

  /**
   * ADR-148 — the number is both searchable and visible. Visible matters as much: an
   * operator who typed a number needs to see which row answered, not trust that it did.
   */
  it('searches by the spoken number and shows it on the row', async () => {
    render(<ParticipantsPage />, {
      'GET /api/admin/participants': { body: { items: [directoryRow] } },
    });
    const row = await screen.findByTestId('participants__row');
    expect(within(row).getByTestId('participants__scan-number')).toHaveTextContent(
      participantFixture.scanNumber,
    );

    const user = userEvent.setup();
    await user.type(screen.getByTestId('participants__search'), '4821');
    await user.click(screen.getByTestId('participants__search-submit'));
    await waitFor(() =>
      expect(stub.calls.some((call) => call.path.includes('search=4821'))).toBe(true),
    );
  });

  /**
   * ADR-164 — the help-desk half of the forgotten-nickname remedy. A participant who cannot
   * remember what they called themselves always still knows their cluster, and this is what
   * turns the whole directory into a list short enough to read to them.
   */
  it('narrows the directory to one cluster, without a submit', async () => {
    render(<ParticipantsPage />, {
      'GET /api/admin/participants': { body: { items: [directoryRow] } },
    });
    await screen.findByTestId('participants__row');
    // Establish the absence this is an absence of: unfiltered, no cluster is sent at all.
    expect(stub.calls.some((call) => call.path.includes('clusterCode='))).toBe(false);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('participants__cluster'), 'CS');

    // Choosing IS the query; there is no second button to press.
    await waitFor(() =>
      expect(stub.calls.some((call) => call.path.includes('clusterCode=CS'))).toBe(true),
    );
  });

  it('shows the participant empty state when a search matches nobody', async () => {
    render(<ParticipantsPage />, { 'GET /api/admin/participants': { body: { items: [] } } });
    expect(await screen.findByText(emptyStates.allParticipants)).toBeVisible();
  });

  it('shows a dash for a participant who has not joined a team', async () => {
    render(<ParticipantsPage />, {
      'GET /api/admin/participants': {
        body: { items: [{ participant: participantFixture, teamName: null }] },
      },
    });
    const row = await screen.findByTestId('participants__row');
    expect(within(row).getByText('—')).toBeVisible();
  });

  it('lists teams with their rosters and the locked state', async () => {
    render(<TeamsDirectoryPage />, {
      'GET /api/admin/teams': {
        body: {
          items: [
            {
              team: { ...teamFixture, isLocked: true },
              memberNicknames: ['BeachBoss', 'SandSprinter'],
              members: [
                { participantId: 'p-1', nickname: 'BeachBoss', isCaptain: true },
                { participantId: 'p-2', nickname: 'SandSprinter', isCaptain: false },
              ],
            },
          ],
        },
      },
    });
    const row = await screen.findByTestId('admin-teams__row');
    expect(within(row).getByText('Locked')).toBeVisible();
    // ADR-154 — the roster cell is a list of actionable members now, not a joined string.
    expect(within(row).getAllByTestId('admin-teams__member')).toHaveLength(2);
    expect(within(row).getByText('BeachBoss')).toBeVisible();
  });

  it('shows an open team as open', async () => {
    render(<TeamsDirectoryPage />, {
      'GET /api/admin/teams': {
        body: {
          items: [
            {
              team: teamFixture,
              memberNicknames: ['BeachBoss'],
              members: [{ participantId: 'p-1', nickname: 'BeachBoss', isCaptain: true }],
            },
          ],
        },
      },
    });
    expect(await screen.findByText('Open')).toBeVisible();
  });

  it('shows the team empty state before anyone forms a squad', async () => {
    render(<TeamsDirectoryPage />, { 'GET /api/admin/teams': { body: { items: [] } } });
    expect(await screen.findByText(emptyStates.allTeams)).toBeVisible();
  });

  it('opens a participant, resets their PIN and reports a bad PIN locally', async () => {
    const detail = {
      participant: participantFixture,
      totals: { fringePoints: 30, tournamentPoints: 10, totalPoints: 40, scanCount: 2 },
      team: teamFixture,
      scans: [scanFixture],
      adjustments: [],
    };
    render(
      <ParticipantDetailPage />,
      {
        [`GET /api/admin/participants/${participantFixture.id}`]: { body: detail },
        [`GET /api/staff/participants/by-nickname/${participantFixture.nickname}`]: {
          body: { participant: participantFixture },
        },
        [`PUT /api/staff/participants/${participantFixture.id}/pin`]: {
          body: { participant: participantFixture },
        },
      },
      { path: `/admin/participants/${participantFixture.id}`, route: '/admin/participants/:participantId' },
    );
    expect(await screen.findByText(/Total 40/)).toBeVisible();
    expect(screen.getByTestId('participant-detail__scan')).toBeVisible();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('participant-detail__pin-submit'));
    expect(await screen.findByTestId('participant-detail__pin-error')).toHaveTextContent(
      messages.pinInvalid,
    );

    await user.type(screen.getByTestId('participant-detail__pin'), '2468');
    await user.click(screen.getByTestId('participant-detail__pin-submit'));
    await waitFor(() =>
      expect(
        stub.callsTo(`PUT /api/staff/participants/${participantFixture.id}/pin`),
      ).toHaveLength(1),
    );
    expect(await screen.findByTestId('participant-detail__pin-confirmation')).toHaveTextContent(
      `PIN reset for ${participantFixture.nickname}`,
    );
  });

  /**
   * ADR-117 — the operational escape hatch, from the console. The reason field is the point
   * of the feature, so the test asserts it reaches the wire alongside the signed value.
   */
  it('ADR-117: deducts points by hand with a justification, and lists the ledger', async () => {
    const detail = {
      participant: participantFixture,
      totals: { fringePoints: 30, tournamentPoints: 10, totalPoints: 40, scanCount: 2 },
      team: teamFixture,
      scans: [scanFixture],
      adjustments: [
        {
          id: 'adj-1',
          participantId: participantFixture.id,
          activityId: activityFixture.id,
          points: -6,
          reason: 'Counted twice when the scanner came back online.',
          activityName: activityFixture.activityName,
          createdByUsername: 'superadmin',
          createdAt: '2026-10-02T02:00:00.000Z',
        },
      ],
    };
    render(
      <ParticipantDetailPage />,
      {
        [`GET /api/admin/participants/${participantFixture.id}`]: { body: detail },
        'GET /api/admin/activities': { body: { items: [activityFixture] } },
        [`POST /api/admin/participants/${participantFixture.id}/adjustments`]: {
          status: 201,
          body: {
            adjustment: {
              ...detail.adjustments[0],
              id: 'adj-2',
              points: -4,
              reason: 'Mis-scan at the volleyball net.',
            },
          },
        },
      },
      {
        path: `/admin/participants/${participantFixture.id}`,
        route: '/admin/participants/:participantId',
      },
    );

    // The existing ledger is visible, signed.
    expect(await screen.findByTestId('participant-detail__adjustment')).toHaveTextContent('-6');

    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId('participant-detail__adjust-activity'),
      activityFixture.id,
    );
    await user.type(screen.getByTestId('participant-detail__adjust-points'), '-4');
    await user.type(
      screen.getByTestId('participant-detail__adjust-reason'),
      'Mis-scan at the volleyball net.',
    );
    await user.click(screen.getByTestId('participant-detail__adjust-submit'));

    await waitFor(() =>
      expect(
        stub.callsTo(`POST /api/admin/participants/${participantFixture.id}/adjustments`),
      ).toHaveLength(1),
    );
    expect(
      stub.callsTo(`POST /api/admin/participants/${participantFixture.id}/adjustments`)[0]?.body,
    ).toEqual({
      activityId: activityFixture.id,
      points: -4,
      reason: 'Mis-scan at the volleyball net.',
    });
    expect(
      await screen.findByTestId('participant-detail__adjust-confirmation'),
    ).toHaveTextContent('-4');
  });

  it('ADR-117: a granted adjustment reads as signed, and a refusal is shown', async () => {
    const positive = {
      id: 'adj-3',
      participantId: participantFixture.id,
      activityId: activityFixture.id,
      points: 15,
      reason: 'Station tablet died mid-round.',
      activityName: activityFixture.activityName,
      createdByUsername: 'superadmin',
      createdAt: '2026-10-02T02:30:00.000Z',
    };
    const detail = {
      participant: participantFixture,
      totals: { fringePoints: 30, tournamentPoints: 10, totalPoints: 40, scanCount: 2 },
      team: teamFixture,
      scans: [scanFixture],
      adjustments: [positive],
    };
    render(
      <ParticipantDetailPage />,
      {
        [`GET /api/admin/participants/${participantFixture.id}`]: { body: detail },
        'GET /api/admin/activities': { body: { items: [activityFixture] } },
        [`POST /api/admin/participants/${participantFixture.id}/adjustments`]: {
          status: 201,
          body: { adjustment: positive },
        },
      },
      {
        path: `/admin/participants/${participantFixture.id}`,
        route: '/admin/participants/:participantId',
      },
    );
    // A grant carries its plus sign; a deduction already carries its minus.
    expect(await screen.findByTestId('participant-detail__adjustment')).toHaveTextContent('+15');

    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId('participant-detail__adjust-activity'),
      activityFixture.id,
    );
    await user.type(screen.getByTestId('participant-detail__adjust-points'), '15');
    await user.type(
      screen.getByTestId('participant-detail__adjust-reason'),
      'Station tablet died mid-round.',
    );
    await user.click(screen.getByTestId('participant-detail__adjust-submit'));
    expect(
      await screen.findByTestId('participant-detail__adjust-confirmation'),
    ).toHaveTextContent('+15');
  });

  it('ADR-117: surfaces the server refusal rather than failing silently', async () => {
    const detail = {
      participant: participantFixture,
      totals: { fringePoints: 30, tournamentPoints: 10, totalPoints: 40, scanCount: 2 },
      team: teamFixture,
      scans: [scanFixture],
      adjustments: [],
    };
    render(
      <ParticipantDetailPage />,
      {
        [`GET /api/admin/participants/${participantFixture.id}`]: { body: detail },
        'GET /api/admin/activities': { body: { items: [activityFixture] } },
        [`POST /api/admin/participants/${participantFixture.id}/adjustments`]: {
          status: 400,
          body: { error: { message: messages.adjustmentPointsInvalid } },
        },
      },
      {
        path: `/admin/participants/${participantFixture.id}`,
        route: '/admin/participants/:participantId',
      },
    );
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId('participant-detail__adjust-activity'),
      activityFixture.id,
    );
    await user.type(screen.getByTestId('participant-detail__adjust-reason'), 'Nothing to give.');
    await user.click(screen.getByTestId('participant-detail__adjust-submit'));
    expect(await screen.findByTestId('participant-detail__adjust-error')).toHaveTextContent(
      messages.adjustmentPointsInvalid,
    );
  });

  it('shows a dash where a teamless participant would have a team', async () => {
    render(
      <ParticipantDetailPage />,
      {
        [`GET /api/admin/participants/${participantFixture.id}`]: {
          body: {
            participant: participantFixture,
            totals: { fringePoints: 0, tournamentPoints: 0, totalPoints: 0, scanCount: 0 },
            team: null,
            scans: [],
          },
        },
      },
      { path: `/admin/participants/${participantFixture.id}`, route: '/admin/participants/:participantId' },
    );
    expect(await screen.findByText('Team: —')).toBeVisible();
    expect(screen.getByText(emptyStates.allScans)).toBeVisible();
  });

  it('reports a participant that cannot be loaded', async () => {
    render(
      <ParticipantDetailPage />,
      {
        'GET /api/admin/participants/missing': {
          status: 404,
          body: { error: { message: messages.participantNotFound } },
        },
      },
      { path: '/admin/participants/missing', route: '/admin/participants/:participantId' },
    );
    expect(await screen.findByText(messages.participantNotFound)).toBeVisible();
  });
});

describe('S55 — correction audit (F45/F48)', () => {
  it('lists each correction with its reason and author', async () => {
    render(<AuditPage />, {
      'GET /api/admin/void-audit': {
        body: {
          items: [
            {
              id: 'audit-1',
              targetType: 'swagclaim',
              targetId: 'claim-1',
              action: 'void',
              reason: 'Handed out by mistake',
              performedBySuperadminId: 'superadmin-1',
              performedByUsername: 'superadmin',
              performedAt: '2026-09-29T03:00:00.000Z',
            },
            {
              id: 'audit-2',
              targetType: 'fringescan',
              targetId: scanFixture.id,
              action: 'unvoid',
              reason: 'Scanned the right person after all',
              performedBySuperadminId: 'superadmin-1',
              performedByUsername: 'superadmin',
              performedAt: '2026-09-29T03:05:00.000Z',
            },
          ],
        },
      },
    });
    const rows = await screen.findAllByTestId('audit__row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText(/swag claim/)).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText(/scan/)).toBeVisible();
  });

  it('uses the FDS empty-state copy when nothing has been corrected', async () => {
    render(<AuditPage />, { 'GET /api/admin/void-audit': { body: { items: [] } } });
    expect(await screen.findByText(emptyStates.voidAuditLog)).toBeVisible();
  });
});

describe('S50–S51 — scan corrections (F47/F48)', () => {
  const routes: RouteTable = {
    'GET /api/admin/scans': { body: { items: [scanFixture] } },
    'GET /api/admin/activities': { body: { items: [activityFixture] } },
  };

  it('voids a scan with a reason and filters the log by activity', async () => {
    render(<ScansPage />, {
      ...routes,
      'POST /api/admin/scans/scan-1/void': { body: { scan: { ...scanFixture, isVoided: true } } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('scans__void'));
    await user.type(screen.getByTestId('reason-dialog__reason'), 'Scanned twice by mistake');
    await user.click(screen.getByTestId('reason-dialog__confirm'));
    await waitFor(() => expect(stub.callsTo('POST /api/admin/scans/scan-1/void')).toHaveLength(1));
    expect(stub.callsTo('POST /api/admin/scans/scan-1/void')[0]?.body).toEqual({
      reason: 'Scanned twice by mistake',
    });

    await user.selectOptions(screen.getByTestId('scans__activity-filter'), activityFixture.id);
    await waitFor(() =>
      expect(stub.calls.some((call) => call.path.includes(`activityId=${activityFixture.id}`))).toBe(
        true,
      ),
    );
    await user.click(screen.getByTestId('scans__refresh'));
  });

  it('restores a voided scan and can cancel the dialog', async () => {
    render(<ScansPage />, {
      ...routes,
      'GET /api/admin/scans': { body: { items: [{ ...scanFixture, isVoided: true }] } },
      'POST /api/admin/scans/scan-1/unvoid': { body: { scan: scanFixture } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('scans__unvoid'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Restore scan');
    await user.click(screen.getByTestId('reason-dialog__cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByTestId('scans__unvoid'));
    await user.type(screen.getByTestId('reason-dialog__reason'), 'Wrong call by the marshal');
    await user.click(screen.getByTestId('reason-dialog__confirm'));
    await waitFor(() => expect(stub.callsTo('POST /api/admin/scans/scan-1/unvoid')).toHaveLength(1));
  });

  it('keeps the dialog open and shows the error when the reason is refused', async () => {
    render(<ScansPage />, {
      ...routes,
      'POST /api/admin/scans/scan-1/void': {
        status: 400,
        body: { error: { message: messages.voidReasonRequired, field: 'reason' } },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('scans__void'));
    await user.type(screen.getByTestId('reason-dialog__reason'), 'Bad');
    await user.click(screen.getByTestId('reason-dialog__confirm'));
    expect(await screen.findByText(messages.voidReasonRequired)).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('shows the FDS empty-state copy when no scans exist yet', async () => {
    render(<ScansPage />, { ...routes, 'GET /api/admin/scans': { body: { items: [] } } });
    expect(await screen.findByText(emptyStates.allScans)).toBeVisible();
  });
});

describe('Every field carries its help (ADR-322)', () => {
  it('the facilitator account form', async () => {
    render(<FacilitatorsPage />, {
      'GET /api/admin/facilitators': { body: { items: [] } },
      'GET /api/admin/courts': { body: { items: [courtFixture] } },
      'GET /api/admin/tournament': { body: { courts: [{ id: courtFixture.id, courtNumber: 1, label: courtFixture.displayLabel, isEnabled: true }], tournament: null, teams: [] } },
      'GET /api/admin/activities': { body: { items: [activityFixture] } },
    });
    await screen.findByTestId('facilitators__username');
    expectEveryFieldDescribed(document.body, 5);
  });

  it('the superadmin account form', async () => {
    render(<SuperadminsPage />, { 'GET /api/admin/superadmins': { body: { items: [] } } });
    await screen.findByTestId('superadmins__username');
    expectEveryFieldDescribed(document.body, 2);
  });

  it('the cluster form', async () => {
    render(<ClustersPage />, { 'GET /api/admin/clusters': { body: { items: [] } } });
    await screen.findByTestId('clusters__code');
    expectEveryFieldDescribed(document.body, 2);
  });

  it('the participant directory search and filter', async () => {
    render(<ParticipantsPage />, { 'GET /api/admin/participants': { body: { items: [] } } });
    await screen.findByTestId('participants__search');
    expectEveryFieldDescribed(document.body, 2);
  });
});
