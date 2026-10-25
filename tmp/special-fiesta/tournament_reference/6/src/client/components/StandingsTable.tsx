import type { StandingRow } from '../../shared/contracts.js';

interface StandingsTableProps {
  standings: StandingRow[];
  groupStandings: Record<string, StandingRow[]>;
}

export function StandingsTable({ standings, groupStandings }: StandingsTableProps) {
  const groups = Object.entries(groupStandings);
  const hasStandings = standings.length > 0;

  return (
    <div className="standings-view" data-testid="standings-table">
      <StandingBlock title="Overall standing" rows={standings} />
      {groups.map(([groupKey, rows]) => <StandingBlock key={groupKey} title={`Group ${groupKey}`} rows={rows} />)}
      {!hasStandings && <p className="inline-note">Standings appear when teams are added.</p>}
    </div>
  );
}

function StandingBlock({ title, rows }: { title: string; rows: StandingRow[] }) {
  return (
    <section className="standing-block">
      <div className="standing-block__header"><h3>{title}</h3><span>{rows.length} teams</span></div>
      <div className="table-scroll">
        <table className="standing-table">
          <thead><tr><th>Rank</th><th>Team</th><th>Played</th><th>W–D–L</th><th>Diff</th><th>Points</th></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.teamId}>
                <td><span className={`rank-mark ${index === 0 ? 'rank-mark--top' : ''}`}>{index + 1}</span></td>
                <td><strong>{row.teamName}</strong><small>Seed {row.seed}</small></td>
                <td>{row.played}</td>
                <td>{row.wins}–{row.draws}–{row.losses}</td>
                <td className={row.scoreDifference >= 0 ? 'positive-number' : 'negative-number'}>{signedNumber(row.scoreDifference)}</td>
                <td><strong>{row.points}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="table-empty">No games recorded for this table yet.</p>}
    </section>
  );
}

function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
