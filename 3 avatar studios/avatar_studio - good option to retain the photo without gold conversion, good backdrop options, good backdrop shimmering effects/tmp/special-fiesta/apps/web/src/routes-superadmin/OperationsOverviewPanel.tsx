import { Link } from 'react-router-dom';
import type {
  OperationsFacilitatorView,
  OperationsMatchView,
  OperationsOutsideTeamsView,
  OperationsOverviewView,
  OperationsStationView,
} from '@psd/contracts';
import { useAdminOperations } from '../lib/hooks/useAdminConfig.js';

/**
 * ADR-151 — the last fifteen minutes, above the totals.
 *
 * The panel it sits on top of has eight tiles under a heading that says "Right now", and
 * every one of them is a count since the database was created. This is the part that is
 * actually about now, so it goes first and the totals keep their honest name below it.
 */
export function OperationsOverviewPanel() {
  const operations = useAdminOperations();
  const overview = operations.overview;

  if (overview === null) {
    return (
      <section className="console-panel">
        <h2>Last 15 minutes</h2>
        <p className="console-muted">{operations.error ?? 'Loading…'}</p>
      </section>
    );
  }

  return (
    <section className="console-panel" data-testid="operations__panel">
      <h2>Last {overview.windowMinutes} minutes</h2>
      <Pulse overview={overview} />
      <OutsideTeams teams={overview.teamsOutside} />
      <StationList stations={overview.stations} window={overview.windowMinutes} />
      <MatchList matches={overview.liveMatches} matchMinutes={overview.matchMinutes} />
      <FacilitatorList facilitators={overview.facilitators} window={overview.windowMinutes} />
    </section>
  );
}

/**
 * ADR-158 — the last thing on the day that can still go silently wrong.
 *
 * ADR-149 built the admissions panel, and it is complete: it counts the teams outside the
 * tournament, says what letting each one in would cost in fixtures and minutes, and does it.
 * What it cannot do is get itself looked at. It lives on the tournament page, which a
 * superadmin visits to schedule the day and then leaves; the panel below is the one they
 * keep open. A team formed at 10:40 was still waiting all afternoon — not because nothing
 * could be done about it, but because nothing said it had happened.
 *
 * So this is a pointer, not a second implementation: a count, a sentence, and a link to the
 * surface that already does the work.
 */
function OutsideTeams(props: { teams: OperationsOutsideTeamsView }) {
  const { count, canAdmit } = props.teams;
  if (count === 0) return null;
  const teamWord = count === 1 ? 'team is' : 'teams are';
  return (
    <p
      className={canAdmit ? 'console-danger' : 'console-muted'}
      data-testid="operations__outside-teams"
    >
      {count} {teamWord} in no group and no fixture, formed after the schedule was activated.{' '}
      {canAdmit ? (
        <Link to="/admin/tournament" data-testid="operations-overview-panel__admit-link">
          Admit them, or decide not to.
        </Link>
      ) : (
        'The group stage has closed, so they can no longer be admitted.'
      )}
    </p>
  );
}

/** The three numbers that answer "is anything still happening" without being read closely. */
function Pulse(props: { overview: OperationsOverviewView }) {
  const { overview } = props;
  const tiles = [
    { label: 'Scans', value: overview.scanCount },
    { label: 'Swag handed out', value: overview.claimCount },
    { label: 'Matches finished', value: overview.matchesCompleted },
  ];
  return (
    <div className="console-grid">
      {tiles.map((tile) => (
        <div key={tile.label} className="console-panel" data-testid="operations__pulse">
          <span className="console-muted">{tile.label}</span>
          <p style={{ fontSize: 30, margin: '8px 0 0' }}>{tile.value}</p>
        </div>
      ))}
    </div>
  );
}

function StationList(props: { stations: readonly OperationsStationView[]; window: number }) {
  if (props.stations.length === 0) return null;
  return (
    <>
      <h3>Stations</h3>
      <table className="console-table">
        <thead>
          <tr>
            <th>Station</th>
            <th>Round</th>
            <th>Recent</th>
            <th>Last</th>
          </tr>
        </thead>
        <tbody>
          {props.stations.map((station) => (
            <StationRow key={station.id} station={station} window={props.window} />
          ))}
        </tbody>
      </table>
    </>
  );
}

function StationRow(props: { station: OperationsStationView; window: number }) {
  const { station } = props;
  return (
    <tr data-testid="operations__station" data-quiet={station.isQuiet ? 'yes' : 'no'}>
      <td>
        {station.name} <span className="console-badge">{station.kind}</span>
      </td>
      <td>{station.openRoundNumber === null ? '—' : `#${station.openRoundNumber}`}</td>
      <td>{station.recentCount}</td>
      <td className={station.isQuiet ? 'console-danger' : undefined}>
        {/*
         * Named rather than coloured. Colour alone says "something about this row", and the
         * superadmin reading it has to work out what — the whole sentence is four words.
         */}
        {station.isQuiet
          ? `Nothing for ${props.window} min`
          : (clockOf(station.lastEventAt) ?? 'Not yet today')}
      </td>
    </tr>
  );
}

function MatchList(props: { matches: readonly OperationsMatchView[]; matchMinutes: number }) {
  if (props.matches.length === 0) return null;
  return (
    <>
      <h3>On court</h3>
      <table className="console-table">
        <thead>
          <tr>
            <th>Court</th>
            <th>Match</th>
            <th>Score</th>
            <th>Running</th>
          </tr>
        </thead>
        <tbody>
          {props.matches.map((match) => (
            <tr
              key={match.id}
              data-testid="operations__match"
              data-overdue={match.isOverdue ? 'yes' : 'no'}
            >
              <td>{match.courtLabel}</td>
              <td>
                {match.teamAName} vs {match.teamBName}
              </td>
              <td>
                {match.scoreA}–{match.scoreB}
              </td>
              <td className={match.isOverdue ? 'console-danger' : undefined}>
                {match.elapsedMinutes} min
                {match.isOverdue ? ` (over ${props.matchMinutes})` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function FacilitatorList(props: {
  facilitators: readonly OperationsFacilitatorView[];
  window: number;
}) {
  if (props.facilitators.length === 0) return null;
  return (
    <>
      <h3>Marshals</h3>
      <table className="console-table">
        <thead>
          <tr>
            <th>Who</th>
            <th>Station</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {props.facilitators.map((person) => (
            <tr
              key={person.id}
              data-testid="operations__facilitator"
              data-active={person.isActive ? 'yes' : 'no'}
            >
              <td>{person.displayLabel ?? person.username}</td>
              <td>{person.defaultStationLabel ?? '—'}</td>
              <td className={person.isActive ? 'console-ok' : 'console-muted'}>
                {/*
                 * "Never" is a different answer from a time, and it is the one worth acting
                 * on at 09:15: an account set up last night for somebody who has not arrived.
                 */}
                {clockOf(person.lastSeenAt) ?? 'Never'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * hh:mm in the reader's own timezone — the only form a wall clock can be compared against.
 * Null in, null out, so each caller supplies the words for "it has not happened": the
 * station's absence and the marshal's are different facts and read differently.
 */
function clockOf(iso: string | null): string | null {
  if (iso === null) return null;
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
