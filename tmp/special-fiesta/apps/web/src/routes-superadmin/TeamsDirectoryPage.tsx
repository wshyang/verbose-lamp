import { emptyStates } from '@psd/contracts';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { AdminShell } from './AdminShell.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { useTeamRepair } from '../lib/hooks/useTeamRepair.js';
import type { AdminTeamMember, AdminTeamRow } from '../lib/hooks/useTeamRepair.js';

/**
 * S54 — the team directory, and since ADR-154 the place a roster gets repaired.
 *
 * It was read-only by design, and that design was right for a normal day: superadmins
 * observe rosters, captains manage them. It fails at 10:40, when the captain is on court
 * with a flat phone and somebody has joined the wrong team off a six-character code read out
 * across a marquee. Every action here is a second door, not a replacement for the first.
 *
 * Each one asks first (ADR-027) and each confirmation names its consequence, because the two
 * that matter are invisible from the row: whether the team is on court right now (§3, the
 * mover loses the points for that match) and whether this is the last member (§6, removing
 * them disbands the team and clears its fixtures).
 */
export function TeamsDirectoryPage() {
  const repair = useTeamRepair();
  const rosterHelp = useFieldHelp();

  return (
    <AdminShell title="Teams">
      <ConfirmDialog confirm={repair.confirm} isBusy={repair.isPending} />
      <section className="console-panel">
        {repair.actionError ? (
          <p className="console-danger" role="alert" data-testid="admin-teams__error">
            {repair.actionError}
          </p>
        ) : null}
        {repair.notice ? (
          <p className="console-note" role="status" data-testid="admin-teams__notice">
            {repair.notice}
          </p>
        ) : null}
        <StateMessage
          isLoading={repair.isLoading}
          error={repair.error}
          isEmpty={repair.rows.length === 0}
          emptyText={emptyStates.allTeams}
          testId="admin-teams"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Captain</th>
              <th>Members <FieldHelp label="Moving people between teams" topic="teamMemberMove" help={rosterHelp} /></th>
              <th>State</th>
              <th>Roster</th>
            </tr>
          </thead>
          <tbody>
            {repair.rows.map((row) => (
              <TeamRow key={row.team.id} row={row} rows={repair.rows} repair={repair} rosterHelpId={rosterHelp.tooltipId} />
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}

type Repair = ReturnType<typeof useTeamRepair>;

function TeamRow(props: { row: AdminTeamRow; rows: AdminTeamRow[]; repair: Repair; rosterHelpId: string }) {
  const { row, rows, repair } = props;
  return (
    <tr data-testid="admin-teams__row">
      <td>{row.team.teamName}</td>
      <td>{row.team.captainNickname}</td>
      <td>{row.team.memberCount}</td>
      <td>
        {row.team.isLocked ? 'Locked' : 'Open'}
        {row.team.isLocked ? (
          <button
            type="button"
            className="console-button console-button--small"
            data-testid="admin-teams__unlock"
            disabled={repair.isPending}
            onClick={() => repair.askUnlock(row)}
          >
            Unlock
          </button>
        ) : null}
      </td>
      <td className="console-muted">
        <ul className="console-list">
          {row.members.map((member) => (
            <MemberRow
              key={member.participantId}
              member={member}
              row={row}
              rows={rows}
              repair={repair}
              rosterHelpId={props.rosterHelpId}
            />
          ))}
        </ul>
        <AddMember row={row} repair={repair} rosterHelpId={props.rosterHelpId} />
      </td>
    </tr>
  );
}

function MemberRow(props: {
  member: AdminTeamMember;
  row: AdminTeamRow;
  rows: AdminTeamRow[];
  repair: Repair;
  rosterHelpId: string;
}) {
  const { member, row, rows, repair } = props;
  const target = { teamId: row.team.id, member };
  // Every other live team. Moving somebody to the team they are already on is not a repair,
  // and the server refuses it anyway — this keeps it off the screen as well.
  const destinations = rows.filter((candidate) => candidate.team.id !== row.team.id);
  const moveTo = async (teamId: string): Promise<void> => {
    const to = destinations.find((candidate) => candidate.team.id === teamId);
    if (to) await repair.askMove(target, { id: to.team.id, teamName: to.team.teamName });
  };

  return (
    <li data-testid="admin-teams__member">
      <span>
        {member.nickname}
        {member.isCaptain ? ' (captain)' : ''}
      </span>
      <select
        className="console-input console-input--small"
        data-testid="admin-teams__move"
        aria-describedby={props.rosterHelpId}
        aria-label={`Move ${member.nickname} to another team`}
        value=""
        disabled={repair.isPending}
        onChange={(event) => void moveTo(event.target.value)}
      >
        <option value="">Move to…</option>
        {destinations.map((candidate) => (
          <option key={candidate.team.id} value={candidate.team.id}>
            {candidate.team.teamName}
          </option>
        ))}
      </select>
      {member.isCaptain ? null : (
        <button
          type="button"
          className="console-button console-button--small"
          data-testid="admin-teams__captain"
          disabled={repair.isPending}
          onClick={() => repair.askCaptain(target, row.team.teamName)}
        >
          Make captain
        </button>
      )}
      <button
        type="button"
        className="console-button console-button--small console-button--danger"
        data-testid="admin-teams__remove"
        disabled={repair.isPending}
        onClick={() => void repair.askRemove(target)}
      >
        Remove
      </button>
    </li>
  );
}

/**
 * The fifth action. Its pool is the un-teamed, which is also the reason it is a picker and
 * not a search box: at 10:40 the person standing in front of you is one of a handful who
 * never got onto a team, and a list you can read is faster than a name you have to spell.
 */
function AddMember(props: { row: AdminTeamRow; repair: Repair; rosterHelpId: string }) {
  const { row, repair } = props;
  if (repair.unassigned.length === 0) return null;

  const team = { id: row.team.id, teamName: row.team.teamName };
  const addTo = (participantId: string): void => {
    const person = repair.unassigned.find((candidate) => candidate.participantId === participantId);
    if (person) repair.askAdd(team, person);
  };

  return (
    <select
      className="console-input console-input--small"
      data-testid="admin-teams__add"
      aria-describedby={props.rosterHelpId}
      aria-label={`Add a participant to ${row.team.teamName}`}
      value=""
      disabled={repair.isPending}
      onChange={(event) => addTo(event.target.value)}
    >
      <option value="">Add a participant…</option>
      {repair.unassigned.map((person) => (
        <option key={person.participantId} value={person.participantId}>
          {person.nickname}
        </option>
      ))}
    </select>
  );
}
