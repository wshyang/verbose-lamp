import { Link, useNavigate } from 'react-router-dom';
import { emptyStates } from '@psd/contracts';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { PixelMotif } from '../components/participant/PixelMotif.js';
import { RoleMotif } from '../components/participant/RoleMotif.js';
import { KebabMenu, type KebabOption } from '../components/participant/KebabMenu.js';
import { AvatarPeek } from '../components/participant/AvatarPeek.js';
import { TeamChatPanel } from '../components/participant/TeamChatPanel.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { useConfirm } from '../lib/hooks/useConfirm.js';
import { formatTime, matchResultLine } from '../lib/format.js';
import { useMyTeam, useTeamDetail } from '../lib/hooks/useTeams.js';

/** S11–S17 — my team: roster, join code, captain tools, lock, leave, match history. */
export function MyTeamPage() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const myTeam = useMyTeam(() => navigate('/teams'));
  const team = myTeam.team;
  const history = useTeamDetail(team?.id ?? '');

  if (myTeam.isLoading) {
    return (
      <GameboyShell title="MY TEAM">
        <p className="loading">Loading…</p>
      </GameboyShell>
    );
  }

  if (!team) {
    return (
      <GameboyShell title="MY TEAM">
        <section className="gb-panel">
          <h2>
            <RoleMotif role="myTeamHero" size={20} className="" />
            No team yet
          </h2>
          <p>Create one or join a friend&apos;s squad to play captain&apos;s ball.</p>
          <Link className="gb-button" to="/teams" data-testid="my-team__find">
            Find a team
          </Link>
        </section>
      </GameboyShell>
    );
  }

  const isCaptain = team.viewerIsCaptain;
  const lockLabel = team.isLocked ? 'Unlock team' : 'Lock team';
  /*
   * ADR-258 — what the captain may do to one member, behind that member's
   * kebab. The confirmations are unchanged; only their front door moved,
   * from two big buttons under every name into the menu at the row's edge.
   */
  const memberOptions = (member: (typeof team.members)[number]): KebabOption[] => {
    if (!isCaptain || member.isCaptain) return [];
    return [
      {
        label: 'Make captain',
        testId: 'my-team__promote',
        onSelect: () =>
          confirm.ask({
            title: `Make ${member.nickname} captain?`,
            body: 'They take over the captain tools and you become an ordinary member.',
            confirmLabel: 'Hand it over',
            run: () => myTeam.makeCaptain(member.participantId),
          }),
      },
      {
        label: 'Remove',
        testId: 'my-team__kick',
        danger: true,
        onSelect: () =>
          confirm.ask({
            title: `Remove ${member.nickname}?`,
            body: `${member.nickname} leaves the squad and can join another team. Their points stay with their cluster.`,
            confirmLabel: 'Remove them',
            isDanger: true,
            run: () => myTeam.kick(member.participantId),
          }),
      },
    ];
  };
  /*
   * ADR-156 — the D is only shown once there is one. A badge reading "2W · 0D · 1L" on a day
   * where draws never happened is noise, and a missing D on a day where they did is a lie, so
   * the shape of the badge follows the record rather than the rules.
   */
  const { wins, draws, losses } = history.record;
  const recordLabel =
    draws > 0 ? `${wins}W · ${draws}D · ${losses}L` : `${wins}W · ${losses}L`;

  return (
    <GameboyShell title="MY TEAM" subtitle={team.teamName}>
      <ConfirmDialog confirm={confirm} />
      <section className="gb-panel">
        <div className="gb-row gb-row--between">
          <h2 style={{ margin: 0 }}>{team.teamName}</h2>
          <span className="gb-badge gb-badge--accent">{recordLabel}</span>
        </div>
        {team.joinCode ? (
          <p>
            Join code: <strong data-testid="my-team__join-code">{team.joinCode}</strong>
          </p>
        ) : null}
        {team.isLocked ? <p className="gb-hint">Locked — no new members.</p> : null}
        {myTeam.error ? (
          <span className="gb-inline-error" role="alert" data-testid="my-team__error">
            {myTeam.error}
          </span>
        ) : null}
      </section>

      <section className="gb-panel">
        <h2>
          <PixelMotif name="face" size={20} className="" />
          Roster ({team.memberCount})
        </h2>
        <ul className="gb-list">
          {team.members.map((member) => (
            <li key={member.participantId} data-testid="my-team__member">
              <div className="gb-row">
                <AvatarPeek person={member} size={32} />
                <span style={{ flex: 1 }}>
                  <strong>{member.nickname}</strong>{' '}
                  <span className="gb-hint">{member.clusterCode}</span>
                </span>
                {/* ADR-258/259 — the cluster is plain text beside the nickname, as
                    it was before the pill; the kebab keeps the row's right edge. */}
                <KebabMenu
                  label={`Actions for ${member.nickname}`}
                  testId="my-team__member-menu"
                  options={memberOptions(member)}
                />
                {member.isCaptain ? <span className="gb-badge gb-badge--accent">Captain</span> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {isCaptain ? (
        <section className="gb-panel">
          <h2>
            <PixelMotif name="trophy" size={20} className="" />
            Captain tools
          </h2>
          {/* ADR-085 — Enter on the nickname adds them, without reaching for the button. */}
          <form
            data-testid="my-team__add-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!myTeam.isAddingMember) void myTeam.submitAddMember();
            }}
          >
            <label className="gb-label" htmlFor="add-member">
              Add by nickname
            </label>
            <input
              id="add-member"
              className="gb-input"
              data-testid="my-team__add-nickname"
              value={myTeam.nicknameToAdd}
              onChange={(event) => myTeam.setNicknameToAdd(event.target.value)}
            />
            <div style={{ height: 12 }} />
            <button
              type="submit"
              className="gb-button"
              data-testid="my-team__add-submit"
              disabled={myTeam.isAddingMember}
            >
              Add to team
            </button>
          </form>
          <div style={{ height: 12 }} />
          <button
            type="button"
            className="gb-button gb-button--secondary"
            data-testid="my-team__lock"
            onClick={() =>
              confirm.ask({
                title: team.isLocked ? 'Unlock the team?' : 'Lock the team?',
                body: team.isLocked
                  ? 'Anyone with the join code can join again.'
                  : 'Nobody else can join, and the squad is set for the tournament.',
                confirmLabel: lockLabel,
                run: team.isLocked ? myTeam.unlockTeam : myTeam.lockTeam,
              })
            }
          >
            {lockLabel}
          </button>
        </section>
      ) : null}

      <section className="gb-panel">
        <h2>
          <PixelMotif name="volleyball" size={20} className="" />
          Match history
        </h2>
        <StateMessage
          isLoading={history.isLoading}
          error={history.error}
          isEmpty={history.matches.length === 0}
          emptyText={emptyStates.teamMatchHistory}
          testId="my-team-matches"
        />
        <ul className="gb-list">
          {history.matches.map((match) => (
            <li key={match.id} data-testid="my-team__match">
              <div className="gb-row gb-row--between">
                <span
                  style={{
                    textDecoration: match.isVoided ? 'line-through' : 'none',
                  }}
                >
                  {matchResultLine({
                    teamAName: match.teamAName,
                    teamBName: match.teamBName,
                    winnerTeamName: match.winnerTeamName,
                    status: match.status,
                  })}
                </span>
                <span className="gb-badge">{match.courtLabel}</span>
              </div>
              <span className="gb-hint">{formatTime(match.startedAt)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="gb-panel">
        <button
          type="button"
          className="gb-button gb-button--danger"
          data-testid="my-team__leave"
          disabled={myTeam.isLeaving}
          onClick={() =>
            confirm.ask({
              title: `Leave ${team.teamName}?`,
              body: 'You will need the join code to come back, and the captain may have locked the team by then.',
              confirmLabel: 'Leave the team',
              isDanger: true,
              run: myTeam.leaveTeamNow,
            })
          }
        >
          Leave team
        </button>
        <p className="gb-hint">
          If you are the captain, the earliest remaining member takes over. The last member leaving
          disbands the team.
        </p>
      </section>

      {/* ADR-063 — below the roster, because it belongs to the team the way the roster does. */}
      {/* ADR-155 — the captain is the room's only moderator, so only they are offered a hide. */}
      <TeamChatPanel key={team.id} teamId={team.id} isCaptain={team.viewerIsCaptain} />
    </GameboyShell>
  );
}
