import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FinalStandingsView, IndividualStandingView } from '@psd/contracts';
import { FinalStandingsPage } from './FinalStandingsPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { superadminSession } from '../test-utils/fixtures.js';
import { clustersCsv, individualsCsv, teamsCsv } from '../lib/standingsCsv.js';

/**
 * ADR-161 — the export.
 *
 * Two things here are worth a test and the rest is a table. The first is the provisional
 * warning, because a sheet printed at 15:40 and read out as the result is the worst thing
 * this page can produce. The second is the CSV text itself: it is the only artefact that
 * leaves the building, nobody will look at it until the day is over, and by then it is too
 * late to notice that every accented nickname arrived mangled.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

/** The first individual, with one field swapped — for the two cases about awkward text. */
function withNickname(nickname: string): FinalStandingsView {
  const first = standings.individuals[0] as IndividualStandingView;
  return { ...standings, individuals: [{ ...first, nickname }] };
}

const standings: FinalStandingsView = {
  generatedAt: '2026-10-05T07:50:00.000Z',
  isProvisional: false,
  tournamentStatus: 'completed',
  clusters: [
    {
      clusterCode: 'BP',
      displayName: 'Blue Pelicans',
      fringePoints: 40,
      tournamentPoints: 20,
      totalPoints: 60,
      participantCount: 3,
      rank: 1,
      reachedAt: '2026-10-05T07:00:00.000Z',
    },
  ],
  individuals: [
    {
      participantId: 'p-1',
      nickname: 'Pelican',
      clusterCode: 'BP',
      gender: 'female',
      avatarVariant: 1,
      avatarLook: 'a',
      avatarPhotoId: null,
      title: 'Swift',
      totalPoints: 30,
      rank: 1,
      reachedAt: '2026-10-05T07:00:00.000Z',
    },
    {
      // The reason the export reads every participant instead of the board's top ten.
      participantId: 'p-2',
      nickname: 'Quiet one',
      clusterCode: 'BP',
      gender: 'male',
      avatarVariant: 2,
      avatarLook: 'b',
      avatarPhotoId: null,
      title: 'Steady',
      totalPoints: 0,
      rank: 2,
      reachedAt: null,
    },
  ],
  teams: [
    {
      groupCode: 'A',
      rank: 1,
      teamId: 't-1',
      teamName: 'Rockets',
      played: 3,
      wins: 2,
      draws: 1,
      losses: 0,
      pointsFor: 30,
      pointsAgainst: 20,
      pointDifference: 10,
      isFullyScored: true,
    },
    {
      groupCode: 'A',
      rank: 2,
      teamId: 't-2',
      teamName: 'Comets',
      played: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
      isFullyScored: false,
    },
  ],
  podium: [
    { place: 1, teamId: 't-1', teamName: 'Rockets', basis: 'Won the final' },
    { place: 2, teamId: 't-2', teamName: 'Comets', basis: 'Lost the final' },
  ],
};

function renderPage(overrides: Partial<FinalStandingsView> = {}) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: superadminSession },
    'GET /api/admin/standings/final': { body: { standings: { ...standings, ...overrides } } },
  });
  return renderWithProviders(<FinalStandingsPage />, { path: '/admin/standings' });
}

describe('the final standings export (ADR-161)', () => {
  it('prints the whole day, including the people who scored nothing', async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getAllByTestId('final-standings__individual-row')).toHaveLength(2),
    );
    expect(screen.getByText('Quiet one')).toBeTruthy();
    expect(screen.getAllByTestId('final-standings__cluster-row')).toHaveLength(1);
    expect(screen.getAllByTestId('final-standings__team-row')).toHaveLength(2);

    const podium = screen.getAllByTestId('final-standings__podium-row');
    expect(podium.map((row) => row.textContent)).toEqual([
      'Rockets Won the final',
      'Comets Lost the final',
    ]);
    // Settled, so nothing on the sheet hedges.
    expect(screen.queryByTestId('final-standings__provisional')).toBeNull();
  });

  it('says so, loudly, when the day is not finished', async () => {
    renderPage({ isProvisional: true, podium: [], tournamentStatus: 'knockout' });

    const warning = await screen.findByTestId('final-standings__provisional');
    expect(warning.textContent).toContain('PROVISIONAL');
    // No rostrum to read out yet, and the page must not invent one from the group tables.
    expect(screen.queryAllByTestId('final-standings__podium-row')).toHaveLength(0);
  });

  it('shows no difference for a table that was not fully scored', async () => {
    renderPage();

    const rows = await screen.findAllByTestId('final-standings__team-row');
    // ADR-115 — Comets played three and carried no score, so '0' would be a claim, not a fact.
    expect(rows[1]?.textContent).toContain('—');
    expect(rows[0]?.textContent).toContain('10');
  });

  it('offers no group tables before a tournament exists, and still prints the rest', async () => {
    renderPage({ tournamentStatus: null, teams: [], podium: [], isProvisional: true });

    await waitFor(() =>
      expect(screen.getAllByTestId('final-standings__cluster-row')).toHaveLength(1),
    );
    // An empty table with headings reads as "nobody played"; no table reads as "not yet".
    expect(screen.queryAllByTestId('final-standings__team-row')).toHaveLength(0);
    expect(screen.queryByText('Group tables')).toBeNull();
  });

  it('prints through the browser rather than rendering its own paper', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    Object.assign(window, { print });
    renderPage();

    await user.click(await screen.findByTestId('final-standings__print'));
    // The sheet is the page itself under print.css, so there is nothing else to call.
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('hands the browser a file when a CSV is asked for', async () => {
    const user = userEvent.setup();
    const clicked: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function recordDownload(this: HTMLAnchorElement) {
        clicked.push(this.download);
      });
    /*
     * jsdom does not implement object URLs AT ALL — not a stub that throws, the properties
     * are simply absent, so `vi.spyOn` has nothing to replace. They are assigned and then
     * deleted instead, which is also a reminder that this is the one code path in the app
     * that only ever runs in a real browser.
     */
    const create = vi.fn(() => 'blob:final');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    try {
      renderPage();
      await screen.findByTestId('final-standings__csv-individuals');
      await user.click(screen.getByTestId('final-standings__csv-individuals'));
      await user.click(screen.getByTestId('final-standings__csv-teams'));
      await user.click(screen.getByTestId('final-standings__csv-clusters'));

      expect(clicked).toEqual([
        'final-standings-individuals-2026-10-05.csv',
        'final-standings-teams-2026-10-05.csv',
        'final-standings-clusters-2026-10-05.csv',
      ]);
      // Every URL handed out is handed back: a console left open all day must not leak.
      expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length);
    } finally {
      click.mockRestore();
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });
});

/**
 * The CSV text, asserted directly. It is the only thing here that outlives the event, and
 * every one of these rules is invisible on screen: a reader who opens the file on a laptop
 * a week later is the first person who could notice any of them being wrong.
 */
describe('the standings CSV (ADR-161)', () => {
  it('leads with a byte order mark, so a spreadsheet reads it as UTF-8', () => {
    expect(individualsCsv(standings).text.startsWith('\uFEFF')).toBe(true);
    expect(individualsCsv(standings).text).toContain('\r\n');
  });

  it('writes a header and one line per row', () => {
    const lines = clustersCsv(standings).text.trimEnd().split('\r\n');
    expect(lines[0]).toBe('\uFEFFRank,Cluster,Code,Fringe points,Tournament points,Total points,People');
    expect(lines[1]).toBe('1,Blue Pelicans,BP,40,20,60,3');
    expect(lines).toHaveLength(2);
  });

  it('leaves the difference blank when the table was not fully scored', () => {
    const lines = teamsCsv(standings).text.trimEnd().split('\r\n');
    expect(lines[1]).toBe('A,1,Rockets,3,2,1,0,30,20,10');
    // Trailing empty field rather than a 0, for the same reason the screen shows a dash.
    expect(lines[2]).toBe('A,2,Comets,3,1,1,1,0,0,');
  });

  it('quotes a name containing a comma or a quote instead of splitting the row', () => {
    const lines = individualsCsv(withNickname('Smith, "Bob"')).text.trimEnd().split('\r\n');
    expect(lines[1]).toBe('1,"Smith, ""Bob""",BP,30');
  });

  /*
   * A nickname is whatever a participant typed, and Excel runs a cell that starts with `=`.
   * The export is the one place in this system where user text is handed to a program that
   * will execute it, so the apostrophe guard has to be here and has to stay here.
   */
  it('defuses a nickname a spreadsheet would otherwise execute', () => {
    expect(individualsCsv(withNickname('=1+1')).text).toContain("'=1+1");
  });
});
