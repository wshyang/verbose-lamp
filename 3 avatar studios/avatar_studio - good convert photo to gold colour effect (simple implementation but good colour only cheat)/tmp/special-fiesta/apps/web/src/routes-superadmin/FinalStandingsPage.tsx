import type { FinalStandingsView } from '@psd/contracts';
import { AdminShell } from './AdminShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatDateTime, roundPoints } from '../lib/format.js';
import { useFinalStandings } from '../lib/hooks/useFinalStandings.js';

/**
 * ADR-161 (§7) — the one screen the day can leave the building on.
 *
 * Designed to be printed as much as read: the prize-giving reads the top of it aloud at
 * 15:50, and the organiser files the rest of it afterwards. Everything on it is one read,
 * so the sheet in somebody's hand and the CSVs in their downloads folder agree by
 * construction rather than by luck.
 */

function Provisional({ standings }: { standings: FinalStandingsView }) {
  if (!standings.isProvisional) return null;
  /*
   * Loud, and printed rather than merely on screen: the whole hazard here is a sheet taken
   * off the printer at 15:40 and read out as the result. It must carry its own warning onto
   * the paper, because the paper is what leaves the room.
   */
  return (
    <p className="final-standings__warning" data-testid="final-standings__provisional">
      PROVISIONAL — the tournament has not finished. These figures will still move.
    </p>
  );
}

function Podium({ places }: { places: FinalStandingsView['podium'] }) {
  if (places.length === 0) return null;
  return (
    <section className="console-panel">
      <h2>Tournament</h2>
      <ol className="final-standings__podium">
        {places.map((place) => (
          <li key={place.teamId} data-testid="final-standings__podium-row">
            <strong>{place.teamName}</strong> <span className="console-muted">{place.basis}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Clusters({ standings }: { standings: FinalStandingsView }) {
  return (
    <section className="console-panel">
      <h2>Clusters</h2>
      <table className="console-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Cluster</th>
            <th>Fringe</th>
            <th>Tournament</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {standings.clusters.map((cluster) => (
            <tr key={cluster.clusterCode} data-testid="final-standings__cluster-row">
              <td>{cluster.rank}</td>
              <td>{cluster.displayName}</td>
              <td>{roundPoints(cluster.fringePoints)}</td>
              <td>{roundPoints(cluster.tournamentPoints)}</td>
              <td>
                <strong>{roundPoints(cluster.totalPoints)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Individuals({ standings }: { standings: FinalStandingsView }) {
  return (
    <section className="console-panel">
      <h2>Individuals — all {standings.individuals.length}</h2>
      <table className="console-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nickname</th>
            <th>Cluster</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {standings.individuals.map((person) => (
            <tr key={person.participantId} data-testid="final-standings__individual-row">
              <td>{person.rank}</td>
              <td>{person.nickname}</td>
              <td>{person.clusterCode}</td>
              <td>{roundPoints(person.totalPoints)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Teams({ standings }: { standings: FinalStandingsView }) {
  if (standings.teams.length === 0) return null;
  return (
    <section className="console-panel">
      <h2>Group tables</h2>
      <table className="console-table">
        <thead>
          <tr>
            <th>Group</th>
            <th>#</th>
            <th>Team</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>Diff</th>
          </tr>
        </thead>
        <tbody>
          {standings.teams.map((team) => (
            <tr key={team.teamId} data-testid="final-standings__team-row">
              <td>{team.groupCode}</td>
              <td>{team.rank}</td>
              <td>{team.teamName}</td>
              <td>{team.played}</td>
              <td>{team.wins}</td>
              <td>{team.draws}</td>
              <td>{team.losses}</td>
              {/* ADR-115 — a partial sum is not a difference, so say nothing rather than a number. */}
              <td>{team.isFullyScored ? team.pointDifference : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function FinalStandingsPage() {
  const page = useFinalStandings();
  const standings = page.standings;

  return (
    <AdminShell title="Final standings">
      <StateMessage
        isLoading={page.isLoading}
        error={page.error}
        isEmpty={false}
        emptyText=""
        testId="final-standings"
      />
      {standings === null ? null : (
        <div className="final-standings">
          <Provisional standings={standings} />
          <section className="console-panel final-standings__actions">
            <p className="console-muted">Read at {formatDateTime(standings.generatedAt)}</p>
            <div className="console-row">
              <button type="button" onClick={page.reload} data-testid="final-standings__reload">
                Read again
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                data-testid="final-standings__print"
              >
                Print
              </button>
              <button
                type="button"
                onClick={page.downloadClusters}
                data-testid="final-standings__csv-clusters"
              >
                Clusters CSV
              </button>
              <button
                type="button"
                onClick={page.downloadIndividuals}
                data-testid="final-standings__csv-individuals"
              >
                Individuals CSV
              </button>
              <button
                type="button"
                onClick={page.downloadTeams}
                data-testid="final-standings__csv-teams"
              >
                Teams CSV
              </button>
            </div>
          </section>
          <Podium places={standings.podium} />
          <Clusters standings={standings} />
          <Individuals standings={standings} />
          <Teams standings={standings} />
        </div>
      )}
    </AdminShell>
  );
}
