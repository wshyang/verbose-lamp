import { Link, Navigate, useNavigate } from 'react-router-dom';
import { emptyStates } from '@psd/contracts';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { PixelMotif } from '../components/participant/PixelMotif.js';
import { RoleMotif } from '../components/participant/RoleMotif.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { useCreateTeam, useJoinByCode, useMyTeam, useTeamBrowser } from '../lib/hooks/useTeams.js';

/** S7 create team, S8 join by code, S9 browse teams — one screen, three ways in. */
export function TeamsPage() {
  const navigate = useNavigate();
  const goToMyTeam = () => navigate('/team');
  const myTeam = useMyTeam();
  const browser = useTeamBrowser(goToMyTeam);
  const create = useCreateTeam(goToMyTeam);
  const joinByCode = useJoinByCode(goToMyTeam);

  const alreadyOnTeam = Boolean(myTeam.team);

  // ADR-099 — don't claim "create a team" before /mine has answered: the create/join
  // panels and the "you're on a team" card are a decision, not a default.
  if (myTeam.isLoading) {
    return (
      <GameboyShell title="TEAMS">
        <p className="loading" data-testid="teams__loading">
          Loading…
        </p>
      </GameboyShell>
    );
  }

  // ADR-103 — somebody on a team has exactly one Teams destination: their team. Straight
  // there, no "you're on a team" interstitial asking for a pointless extra tap.
  if (alreadyOnTeam) {
    return <Navigate to="/team" replace />;
  }

  return (
    <GameboyShell title="TEAMS" subtitle="Captain's ball squads">
      <section className="gb-panel">
        <h2>
          <RoleMotif role="teamsHero" size={20} className="" />
          Create a team
        </h2>
        {/* ADR-085 — a real form, so Enter on the name creates the team. */}
        <form
          data-testid="teams__create-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (create.canSubmit && !create.isPending) create.submit();
          }}
        >
          <label className="gb-label" htmlFor="team-name">
            Team name
          </label>
          <input
            id="team-name"
            className="gb-input"
            data-testid="teams__create-name"
            value={create.teamName}
            maxLength={30}
            onChange={(event) => create.setTeamName(event.target.value)}
          />
          {create.error ? (
            <span className="gb-inline-error" role="alert" data-testid="teams__create-error">
              {create.error}
            </span>
          ) : null}
          <div style={{ height: 12 }} />
          <button
            type="submit"
            className="gb-button"
            data-testid="teams__create-submit"
            disabled={!create.canSubmit || create.isPending}
          >
            Create &amp; be captain
          </button>
        </form>
      </section>

      <section className="gb-panel">
        <h2>
          <PixelMotif name="badge" size={20} className="" />
          Join with a code
        </h2>
        {/* ADR-085 — Enter on the code joins, which is the whole interaction on this panel. */}
        <form
          data-testid="teams__join-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (joinByCode.canSubmit && !joinByCode.isPending) joinByCode.submit();
          }}
        >
          <label className="gb-label" htmlFor="join-code">
            6-character join code
          </label>
          <input
            id="join-code"
            className="gb-input"
            data-testid="teams__join-code"
            value={joinByCode.joinCode}
            maxLength={6}
            autoCapitalize="characters"
            onChange={(event) => joinByCode.setJoinCode(event.target.value)}
          />
          {joinByCode.error ? (
            <span className="gb-inline-error" role="alert" data-testid="teams__join-error">
              {joinByCode.error}
            </span>
          ) : null}
          <div style={{ height: 12 }} />
          <button
            type="submit"
            className="gb-button gb-button--secondary"
            data-testid="teams__join-submit"
            disabled={!joinByCode.canSubmit || joinByCode.isPending}
          >
            Join team
          </button>
        </form>
      </section>

      <section className="gb-panel">
        <h2>
          <RoleMotif role="teamsQuiet" size={20} className="" />
          Browse teams
        </h2>
        <label className="gb-label" htmlFor="team-search">
          Search
        </label>
        <input
          id="team-search"
          className="gb-input"
          data-testid="teams__search"
          value={browser.search}
          onChange={(event) => browser.setSearch(event.target.value)}
        />
        <StateMessage
          isLoading={browser.isLoading}
          error={browser.error}
          isEmpty={browser.isEmpty}
          emptyText={emptyStates.browseTeams}
          testId="team-browse"
        />
        <ul className="gb-list">
          {browser.teams.map((team) => (
            <li key={team.id} data-testid="team-browse__row">
              <div className="gb-row gb-row--between">
                <Link to={`/teams/${team.id}`} data-testid="team-browse__detail">
                  <strong>{team.teamName}</strong>
                </Link>
                <span className="gb-badge">{team.memberCount} members</span>
              </div>
              <div className="gb-row gb-row--between">
                <span className="gb-hint">Captain {team.captainNickname}</span>
                {team.isLocked ? (
                  <span className="gb-badge">Locked</span>
                ) : (
                  <button
                    type="button"
                    className="gb-button gb-button--small"
                    data-testid="team-browse__join"
                    disabled={browser.isJoining}
                    onClick={() => browser.joinTeam(team.id)}
                  >
                    Join
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </GameboyShell>
  );
}
