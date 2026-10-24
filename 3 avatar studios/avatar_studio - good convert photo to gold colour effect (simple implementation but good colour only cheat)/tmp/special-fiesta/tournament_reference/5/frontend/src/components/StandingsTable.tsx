import type { StandingRow } from '../../../shared/types.js';
import { standingExplanation } from '../../../shared/standings.js';

interface Props { standings: StandingRow[] }

export default function StandingsTable({ standings }: Props) {
  const rows = standings.map((row) => (
    <tr key={row.teamId} data-testid="standings__row">
      <td>{row.rank}</td>
      <td>{row.name}</td>
      <td>{row.points}</td>
      <td>{row.played}</td>
      <td>{row.wins}</td>
      <td>{row.draws}</td>
      <td>{row.losses}</td>
      <td>{row.scoreDifference}</td>
      <td className="explanation">{standingExplanation(row)}</td>
    </tr>
  ));
  if (standings.length === 0) return <p data-testid="standings__empty">No teams yet.</p>;
  return (
    <table className="table" data-testid="standings__table">
      <thead>
        <tr>
          <th>#</th><th>Team</th><th>Pts</th><th>P</th><th>W</th>
          <th>D</th><th>L</th><th>Diff</th><th>Why this line</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}
