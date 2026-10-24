import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { messages } from '@psd/contracts';
import { DashboardPage } from './DashboardPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { superadminSession } from '../test-utils/fixtures.js';

/**
 * ADR-151 — the operations overview.
 *
 * These tests are about the difference between a true number and a useful one. The eight
 * tiles under this panel can all say how many scans there have ever been; none of them can
 * say whether anything is happening, which is the only question asked from the laptop
 * between 09:00 and 16:00.
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

function station(over?: Partial<Record<string, unknown>>) {
  return {
    kind: 'fringe',
    id: 's1',
    name: 'Tug of War',
    openRoundNumber: 2,
    recentCount: 7,
    lastEventAt: '2026-10-04T03:14:00.000Z',
    isQuiet: false,
    ...over,
  };
}

function overview(over?: Partial<Record<string, unknown>>) {
  return {
    generatedAt: '2026-10-04T03:15:00.000Z',
    windowMinutes: 15,
    matchMinutes: 12,
    scanCount: 7,
    claimCount: 2,
    matchesCompleted: 1,
    teamsOutside: { count: 0, canAdmit: false },
    stations: [station()],
    liveMatches: [],
    facilitators: [],
    ...over,
  };
}

function render(body: unknown) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: superadminSession },
    'GET /api/admin/dashboard': { body: { status: dashboardStatus } },
    'GET /api/admin/operations': { body: { overview: body } },
  });
  return renderWithProviders(<DashboardPage />);
}

describe('the operations overview (ADR-151)', () => {
  it('leads with the window, and leaves the totals honestly named below it', async () => {
    render(overview());

    await screen.findByTestId('operations__panel');
    expect(screen.getByText('Last 15 minutes')).toBeVisible();
    const pulse = screen.getAllByTestId('operations__pulse');
    expect(pulse).toHaveLength(3);
    expect(within(pulse[0] as HTMLElement).getByText('7')).toBeVisible();
    /*
     * The heading over the eight cumulative tiles used to say "Right now", which was the one
     * piece of prose on this page that was simply false.
     */
    expect(screen.getByText('Totals so far')).toBeVisible();
    expect(screen.queryByText('Right now')).toBeNull();
  });

  it('says in words that a station has gone quiet, not just in colour', async () => {
    render(
      overview({
        stations: [station({ isQuiet: true, recentCount: 0, lastEventAt: null })],
      }),
    );

    const row = await screen.findByTestId('operations__station');
    expect(row.getAttribute('data-quiet')).toBe('yes');
    // Colour alone says "something about this row" and leaves the reader to work out what.
    expect(within(row).getByText('Nothing for 15 min')).toBeVisible();
    // The round is still open, which is exactly what makes the silence worth showing.
    expect(within(row).getByText('#2')).toBeVisible();
  });

  it('distinguishes a station with no open round from one that has gone quiet', async () => {
    render(overview({ stations: [station({ openRoundNumber: null, recentCount: 0 })] }));

    const row = await screen.findByTestId('operations__station');
    expect(row.getAttribute('data-quiet')).toBe('no');
    expect(within(row).getByText('—')).toBeVisible();
    expect(within(row).queryByText(/Nothing for/)).toBeNull();
  });

  it('shows a station that has recorded nothing all day as exactly that', async () => {
    // No round open, so not "quiet" — just a stall nobody has started yet.
    render(
      overview({
        stations: [station({ openRoundNumber: null, recentCount: 0, lastEventAt: null })],
      }),
    );

    const row = await screen.findByTestId('operations__station');
    expect(within(row).getByText('Not yet today')).toBeVisible();
  });

  it('leaves a match that is running to time unmarked', async () => {
    render(
      overview({
        liveMatches: [
          {
            id: 'm2',
            courtLabel: 'Court 1',
            teamAName: 'Kelp Kings',
            teamBName: 'Sand Sharks',
            scoreA: 3,
            scoreB: 2,
            startedAt: '2026-10-04T03:10:00.000Z',
            elapsedMinutes: 5,
            isOverdue: false,
          },
        ],
      }),
    );

    const row = await screen.findByTestId('operations__match');
    expect(row.getAttribute('data-overdue')).toBe('no');
    // Plain minutes, with no threshold quoted: the number only needs explaining when it is
    // a problem, and quoting it on every row would make the mark mean nothing.
    expect(within(row).getByText('5 min')).toBeVisible();
  });

  it('marks a match that has outrun the length the schedule is built on', async () => {
    render(
      overview({
        liveMatches: [
          {
            id: 'm1',
            courtLabel: 'Court 2',
            teamAName: 'Reef Raiders',
            teamBName: 'Dune Dogs',
            scoreA: 14,
            scoreB: 11,
            startedAt: '2026-10-04T02:30:00.000Z',
            elapsedMinutes: 45,
            isOverdue: true,
          },
        ],
      }),
    );

    const row = await screen.findByTestId('operations__match');
    expect(row.getAttribute('data-overdue')).toBe('yes');
    // The threshold is named, so nobody has to go and look up what "overdue" means here.
    expect(within(row).getByText('45 min (over 12)')).toBeVisible();
    expect(within(row).getByText('14–11')).toBeVisible();
  });

  it('shows a marshal who has never opened the app as never, not as a time', async () => {
    render(
      overview({
        facilitators: [
          {
            id: 'f1',
            username: 'quiet',
            displayLabel: 'Sam',
            defaultStationLabel: 'Court 1',
            lastSeenAt: null,
            isActive: false,
          },
          {
            id: 'f2',
            username: 'busy',
            displayLabel: null,
            defaultStationLabel: null,
            lastSeenAt: '2026-10-04T03:14:00.000Z',
            isActive: true,
          },
        ],
      }),
    );

    const rows = await screen.findAllByTestId('operations__facilitator');
    expect(rows).toHaveLength(2);
    /*
     * An account created last night for somebody who has not arrived is a different problem
     * from a marshal whose phone died at eleven, and only one of them is fixed by walking
     * over to the court.
     */
    expect(rows[0]?.getAttribute('data-active')).toBe('no');
    expect(within(rows[0] as HTMLElement).getByText('Never')).toBeVisible();
    expect(rows[1]?.getAttribute('data-active')).toBe('yes');
    expect(within(rows[1] as HTMLElement).getByText('busy')).toBeVisible();
  });

  it('leaves the empty sections out rather than printing empty tables', async () => {
    // Before the first round opens there are no stations, no matches and no marshals seen.
    render(overview({ stations: [], liveMatches: [], facilitators: [] }));

    await screen.findByTestId('operations__panel');
    expect(screen.queryByText('Stations')).toBeNull();
    expect(screen.queryByText('On court')).toBeNull();
    expect(screen.queryByText('Marshals')).toBeNull();
  });

  it('says why it is blank rather than pretending the day is quiet', async () => {
    stub = installFetchStub({
      'GET /api/auth/session': { body: superadminSession },
      'GET /api/admin/dashboard': { body: { status: dashboardStatus } },
      'GET /api/admin/operations': {
        status: 401,
        body: { error: { message: messages.signInRequired } },
      },
    });
    renderWithProviders(<DashboardPage />);

    // A panel that silently shows nothing is indistinguishable from an event where nothing
    // is happening, which is the exact mistake this whole surface exists to prevent.
    await waitFor(() => expect(screen.getByText(messages.signInRequired)).toBeVisible());
  });

  /*
   * ADR-158 — the admissions panel ADR-149 built is complete and lives on another page. The
   * failure it cannot prevent is nobody going to look at it, so the count appears here.
   */
  it('warns that teams are outside the tournament, and sends the superadmin to admit them', async () => {
    render(overview({ teamsOutside: { count: 2, canAdmit: true } }));

    const warning = await screen.findByTestId('operations__outside-teams');
    expect(warning).toHaveTextContent('2 teams are in no group and no fixture');
    expect(within(warning).getByRole('link')).toHaveAttribute('href', '/admin/tournament');
    expect(warning).toHaveClass('console-danger');
  });

  /*
   * The count must NOT disappear when the group stage closes. Silence on a panel like this
   * reads as "resolved", and the superadmin who saw two outside teams would conclude they
   * had been let in. The number stays and the sentence changes.
   */
  it('keeps reporting outside teams once it is too late to admit them, without a link', async () => {
    render(overview({ teamsOutside: { count: 2, canAdmit: false } }));

    const warning = await screen.findByTestId('operations__outside-teams');
    expect(warning).toHaveTextContent('can no longer be admitted');
    expect(within(warning).queryByRole('link')).toBeNull();
    expect(warning).not.toHaveClass('console-danger');
  });

  it('says nothing at all when every team is in the tournament', async () => {
    render(overview());

    await screen.findByTestId('operations__panel');
    expect(screen.queryByTestId('operations__outside-teams')).toBeNull();
  });

  it('makes one team singular', async () => {
    render(overview({ teamsOutside: { count: 1, canAdmit: true } }));

    expect(await screen.findByTestId('operations__outside-teams')).toHaveTextContent(
      '1 team is in no group',
    );
  });
});