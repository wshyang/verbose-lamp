import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamsDirectoryPage } from './TeamsDirectoryPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { participantFixture, superadminSession, teamFixture } from '../test-utils/fixtures.js';

/**
 * ADR-154 — roster repair from the console.
 *
 * What is tested here is mostly the SENTENCES. The writes are thin; the thing that makes this
 * feature safe is that the superadmin is told what a repair will do before it does it, and
 * two of those consequences — a live match costing the mover their points, and removing a
 * lone captain disbanding the team — cannot be seen on the row they are standing on.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

const DUNE = { ...teamFixture, id: 'team-dune', teamName: 'Dune Dogs', captainNickname: 'Sam' };
const REEF = {
  ...teamFixture,
  id: 'team-reef',
  teamName: 'Reef Raiders',
  captainNickname: 'Kai',
  memberCount: 3,
};

const duneRow = (members: { participantId: string; nickname: string; isCaptain: boolean }[]) => ({
  team: { ...DUNE, memberCount: members.length },
  memberNicknames: members.map((m) => m.nickname),
  members,
});

const reefRow = {
  team: REEF,
  memberNicknames: ['Kai'],
  members: [{ participantId: 'p-kai', nickname: 'Kai', isCaptain: true }],
};

const SAM = { participantId: 'p-sam', nickname: 'Sam', isCaptain: true };
const PRIYA = { participantId: 'p-priya', nickname: 'Priya', isCaptain: false };

function render(routes: RouteTable) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: superadminSession },
    /*
     * ADR-211 — the add-a-member combobox searches the directory as soon as the page mounts,
     * whether or not the test is about adding anybody. Keyed with the empty query to match how
     * the tests below key it: a query-less key would take precedence over theirs and hand them
     * an empty directory.
     */
    'GET /api/admin/participants?search=': { body: { items: [] } },
    ...routes,
  });
  return renderWithProviders(<TeamsDirectoryPage />);
}

const context = (over: Record<string, unknown> = {}) => ({
  body: { teamName: 'Dune Dogs', memberCount: 2, liveMatchCourtName: null, ...over },
});

describe('ADR-154 — the confirmation names the consequence', () => {
  /*
   * §3 — the hole in ADR-005. The roster snapshot is taken at completion, not at start, so a
   * mid-match move costs the mover the points for a match they actually played. The tool does
   * not close that hole; it refuses to let a superadmin walk into it unknowingly.
   */
  it('warns that a mid-match move costs the mover their points', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM, PRIYA]), reefRow] } },
      'GET /api/admin/teams/team-dune/repair-context': context({ liveMatchCourtName: 'Court 2' }),
    });

    const member = (await screen.findAllByTestId('admin-teams__member'))[1] as HTMLElement;
    await user.selectOptions(within(member).getByTestId('admin-teams__move'), 'team-reef');

    const body = await screen.findByTestId('confirm-dialog__body');
    expect(body).toHaveTextContent(
      'Dune Dogs are on Court 2 right now. If you move Priya before that match is completed, they will not be credited for it.',
    );
  });

  it('does not invent a warning when the team is not on court', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM, PRIYA]), reefRow] } },
      'GET /api/admin/teams/team-dune/repair-context': context(),
    });

    const member = (await screen.findAllByTestId('admin-teams__member'))[1] as HTMLElement;
    await user.selectOptions(within(member).getByTestId('admin-teams__move'), 'team-reef');

    const body = await screen.findByTestId('confirm-dialog__body');
    expect(body).toHaveTextContent('Priya will be moved to Reef Raiders.');
    expect(body).not.toHaveTextContent('right now');
  });

  /*
   * §6 — `invalidateMembership` disbands a team whose last member goes. Inheriting that
   * silently from a staff action would mean a superadmin deleting a team by pressing Remove.
   */
  it('warns that removing the only member disbands the team', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM])] } },
      'GET /api/admin/teams/team-dune/repair-context': context({ memberCount: 1 }),
    });

    await user.click(await screen.findByTestId('admin-teams__remove'));

    expect(await screen.findByTestId('confirm-dialog__body')).toHaveTextContent(
      'Sam is the only member. Removing them disbands Dune Dogs, and any of their unplayed fixtures will be removed from the schedule.',
    );
  });

  // The read happens before the question, so what is asked is what was true a moment ago —
  // not what the directory happened to be showing since the page loaded.
  it('asks the server for the team state rather than trusting the row on screen', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM, PRIYA])] } },
      'GET /api/admin/teams/team-dune/repair-context': context({ memberCount: 1 }),
    });

    await user.click((await screen.findAllByTestId('admin-teams__remove'))[0] as HTMLElement);

    // The row says two members; the server says one. The server wins.
    expect(await screen.findByTestId('confirm-dialog__body')).toHaveTextContent(
      'Sam is the only member.',
    );
  });
});

describe('ADR-154 — adding somebody who never got onto a team', () => {
  const people = (rows: { nickname: string; teamName: string | null }[]) => ({
    body: {
      items: rows.map((row, index) => ({
        participant: { ...participantFixture, id: `p-free-${index}`, nickname: row.nickname },
        teamName: row.teamName,
      })),
    },
  });

  // Somebody already on a team cannot be added to a second: the active-membership constraint
  // refuses it. Offering them would be offering a button that can only produce an error.
  it('offers only the un-teamed', async () => {
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM])] } },
      'GET /api/admin/participants?search=': people([
        { nickname: 'Nobody', teamName: null },
        { nickname: 'Taken', teamName: 'Reef Raiders' },
      ]),
    });

    const picker = await screen.findByTestId('admin-teams__add');
    expect(within(picker).getByText('Nobody')).toBeVisible();
    expect(within(picker).queryByText('Taken')).toBeNull();
  });

  it('adds the chosen participant once the addition is confirmed', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM])] } },
      'GET /api/admin/participants?search=': people([{ nickname: 'Nobody', teamName: null }]),
      'POST /api/admin/teams/team-dune/members': { body: { ok: true } },
    });

    await user.selectOptions(await screen.findByTestId('admin-teams__add'), 'p-free-0');
    expect(await screen.findByTestId('confirm-dialog__body')).toHaveTextContent(
      'Nobody joins Dune Dogs.',
    );
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/teams/team-dune/members').length).toBe(1),
    );
  });

  it('hides the picker entirely when everybody already has a team', async () => {
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM])] } },
      'GET /api/admin/participants?search=': people([
        { nickname: 'Taken', teamName: 'Reef Raiders' },
      ]),
    });

    await screen.findByTestId('admin-teams__row');
    expect(screen.queryByTestId('admin-teams__add')).toBeNull();
  });
});

describe('ADR-154 — the repair itself', () => {
  it('removes a member only after the confirmation is accepted', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM, PRIYA])] } },
      'GET /api/admin/teams/team-dune/repair-context': context(),
      'DELETE /api/admin/teams/team-dune/members/p-priya': {
        body: { outcome: 'left', withdrawal: null },
      },
    });

    const member = (await screen.findAllByTestId('admin-teams__member'))[1] as HTMLElement;
    await user.click(within(member).getByTestId('admin-teams__remove'));
    // Nothing has been sent yet: the dialog is the guard, not a formality.
    expect(stub.callsTo('DELETE /api/admin/teams/team-dune/members/p-priya').length).toBe(0);

    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    await waitFor(() =>
      expect(stub.callsTo('DELETE /api/admin/teams/team-dune/members/p-priya').length).toBe(1),
    );
  });

  it('sends nothing at all when the superadmin backs out', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM, PRIYA])] } },
      'GET /api/admin/teams/team-dune/repair-context': context(),
      'DELETE /api/admin/teams/team-dune/members/p-priya': {
        body: { outcome: 'left', withdrawal: null },
      },
    });

    const member = (await screen.findAllByTestId('admin-teams__member'))[1] as HTMLElement;
    await user.click(within(member).getByTestId('admin-teams__remove'));
    await user.click(screen.getByTestId('confirm-dialog__cancel'));

    expect(stub.callsTo('DELETE /api/admin/teams/team-dune/members/p-priya').length).toBe(0);
  });

  /*
   * §7 — the asymmetry is announced rather than hidden. Somebody really does end up playing
   * fewer matches than their neighbours, and they should hear it from the console.
   */
  it('reports what a withdrawal did to the schedule', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM]), reefRow] } },
      'GET /api/admin/teams/team-dune/repair-context': context({ memberCount: 1 }),
      'DELETE /api/admin/teams/team-dune/members/p-sam': {
        body: {
          outcome: 'team_disbanded',
          withdrawal: { playedCount: 2, skippedCount: 1, affectedTeamIds: ['team-reef'] },
        },
      },
    });

    // Dune Dogs' own row, not Reef Raiders': both are on screen and both have a Remove.
    const dune = (await screen.findAllByTestId('admin-teams__member'))[0] as HTMLElement;
    await user.click(within(dune).getByTestId('admin-teams__remove'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    expect(await screen.findByTestId('admin-teams__notice')).toHaveTextContent(
      'Dune Dogs withdrew. 2 of their 3 fixtures had been played; those results stand. The remaining 1 has been removed, so Reef Raiders play fewer group matches.',
    );
  });

  /*
   * One route, one transaction. The unique active-membership index means the old seat must
   * expire and the new one appear together; a console that did remove-then-add would strand
   * somebody on no team the moment the second call failed.
   */
  it('moves a member in a single call that names both teams', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM, PRIYA]), reefRow] } },
      'GET /api/admin/teams/team-dune/repair-context': context(),
      'POST /api/admin/teams/members/move': {
        body: { from: 'team-dune', withdrawal: null },
      },
    });

    const member = (await screen.findAllByTestId('admin-teams__member'))[1] as HTMLElement;
    await user.selectOptions(within(member).getByTestId('admin-teams__move'), 'team-reef');
    await user.click(await screen.findByTestId('confirm-dialog__confirm'));

    await waitFor(() => expect(stub.callsTo('POST /api/admin/teams/members/move').length).toBe(1));
    expect(stub.callsTo('POST /api/admin/teams/members/move')[0]?.body).toEqual({
      participantId: 'p-priya',
      fromTeamId: 'team-dune',
      toTeamId: 'team-reef',
    });
  });

  it('transfers the captaincy, and says so before it does', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM, PRIYA])] } },
      'POST /api/admin/teams/team-dune/captain': { body: { ok: true } },
    });

    const member = (await screen.findAllByTestId('admin-teams__member'))[1] as HTMLElement;
    await user.click(within(member).getByTestId('admin-teams__captain'));
    expect(await screen.findByTestId('confirm-dialog__body')).toHaveTextContent(
      'Priya becomes captain of Dune Dogs. The team is told.',
    );
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/teams/team-dune/captain').length).toBe(1),
    );
  });

  it('unlocks a team whose captain has gone, and only offers it when locked', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': {
        body: { items: [{ ...duneRow([SAM]), team: { ...DUNE, isLocked: true } }] },
      },
      'POST /api/admin/teams/team-dune/unlock': { body: { ok: true } },
    });

    await user.click(await screen.findByTestId('admin-teams__unlock'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    await waitFor(() => expect(stub.callsTo('POST /api/admin/teams/team-dune/unlock').length).toBe(1));
  });

  it('offers no unlock for a team that is already open', async () => {
    render({ 'GET /api/admin/teams': { body: { items: [duneRow([SAM])] } } });

    await screen.findByTestId('admin-teams__row');
    expect(screen.queryByTestId('admin-teams__unlock')).toBeNull();
  });

  // The captain is already the captain; offering to promote them is a button that can only
  // ever do nothing, and a console full of those is how the real ones get ignored.
  it('offers "make captain" for members but not for the captain', async () => {
    render({ 'GET /api/admin/teams': { body: { items: [duneRow([SAM, PRIYA])] } } });

    const members = await screen.findAllByTestId('admin-teams__member');
    expect(within(members[0] as HTMLElement).queryByTestId('admin-teams__captain')).toBeNull();
    expect(within(members[1] as HTMLElement).getByTestId('admin-teams__captain')).toBeVisible();
  });

  it('never offers to move somebody to the team they are already on', async () => {
    render({ 'GET /api/admin/teams': { body: { items: [duneRow([SAM]), reefRow] } } });

    const member = (await screen.findAllByTestId('admin-teams__member'))[0] as HTMLElement;
    const options = within(member).getByTestId('admin-teams__move');
    expect(within(options).queryByText('Dune Dogs')).toBeNull();
    expect(within(options).getByText('Reef Raiders')).toBeVisible();
  });

  it('surfaces a refusal from the server rather than failing silently', async () => {
    const user = userEvent.setup();
    render({
      'GET /api/admin/teams': { body: { items: [duneRow([SAM, PRIYA])] } },
      'GET /api/admin/teams/team-dune/repair-context': context(),
      'DELETE /api/admin/teams/team-dune/members/p-priya': {
        status: 409,
        body: { error: { message: 'That participant is not on this team.' } },
      },
    });

    const member = (await screen.findAllByTestId('admin-teams__member'))[1] as HTMLElement;
    await user.click(within(member).getByTestId('admin-teams__remove'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    expect(await screen.findByTestId('admin-teams__error')).toHaveTextContent(
      'That participant is not on this team.',
    );
  });
});
