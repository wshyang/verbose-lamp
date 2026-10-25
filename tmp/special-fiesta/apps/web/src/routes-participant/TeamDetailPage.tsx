import { emptyStates } from '@psd/contracts';
import { useRouteId } from '../lib/hooks/useRouteId.js';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { PixelMotif } from '../components/participant/PixelMotif.js';
import { AvatarPeek } from '../components/participant/AvatarPeek.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatTime, matchResultLine } from '../lib/format.js';
import { useTeamDetail } from '../lib/hooks/useTeams.js';

/** S10 — public team detail, including S17's match history for that team. */
export function TeamDetailPage() {
  const teamId = useRouteId('teamId');
  const detail = useTeamDetail(teamId);
  const team = detail.team;

  if (!team) {
    return (
      <GameboyShell title="TEAM">
        <p className="loading">{detail.error ?? 'Loading…'}</p>
      </GameboyShell>
    );
  }

  /*
   * ADR-156 — the D is only shown once there is one. A badge reading "2W · 0D · 1L" on a day
   * where draws never happened is noise, and a missing D on a day where they did is a lie, so
   * the shape of the badge follows the record rather than the rules.
   */
  const { wins, draws, losses } = detail.record;
  const recordLabel =
    draws > 0 ? `${wins}W · ${draws}D · ${losses}L` : `${wins}W · ${losses}L`;

  return (
    <GameboyShell title="TEAM" subtitle={team.teamName}>
      <section className="gb-panel">
        <div className="gb-row gb-row--between">
          <h2 style={{ margin: 0 }}>{team.teamName}</h2>
          <span className="gb-badge gb-badge--accent">{recordLabel}</span>
        </div>
        <p className="gb-hint">
          Captain {team.captainNickname} · {team.memberCount} members
          {team.isLocked ? ' · locked' : ''}
        </p>
        <ul className="gb-list">
          {team.members.map((member) => (
            <li key={member.participantId} data-testid="team-detail__member">
              <div className="gb-row">
                <AvatarPeek person={member} size={32} />
                <span style={{ flex: 1 }}>
                  <strong>{member.nickname}</strong> <span className="gb-hint">{member.clusterCode}</span>
                </span>
                {member.isCaptain ? <span className="gb-badge gb-badge--accent">Captain</span> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="gb-panel">
        <h2>
          <PixelMotif name="volleyball" size={20} className="" />
          Match history
        </h2>
        <StateMessage
          isLoading={detail.isLoading}
          error={detail.error}
          isEmpty={detail.matches.length === 0}
          emptyText={emptyStates.teamMatchHistory}
          testId="team-matches"
        />
        <ul className="gb-list">
          {detail.matches.map((match) => (
            <li key={match.id} data-testid="team-detail__match">
              <div className="gb-row gb-row--between">
                <span style={{ textDecoration: match.isVoided ? 'line-through' : 'none' }}>
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
    </GameboyShell>
  );
}
