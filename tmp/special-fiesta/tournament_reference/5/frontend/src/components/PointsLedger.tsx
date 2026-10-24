import { useState } from 'react';
import type { TournamentGraph } from '../../../shared/types.js';

interface Props {
  graph: TournamentGraph;
  onVoid: (entryId: string, reason: string) => Promise<void>;
}

export default function PointsLedger({ graph, onVoid }: Props) {
  const [voidReason, setVoidReason] = useState('Awarded in error');
  const teamName = (teamId: string) => graph.teams.find((team) => team.id === teamId)?.name ?? teamId;
  const rows = graph.pointsEntries.map((entry) => (
    <tr key={entry.id} data-testid="ledger__row">
      <td>{teamName(entry.teamId)}</td>
      <td>{entry.points}</td>
      <td>{entry.reason}</td>
      <td>{entry.status === 'voided' ? `Voided: ${entry.voidReason ?? ''}` : 'Active'}</td>
      <td>
        <button
          type="button"
          data-testid="ledger__void-button"
          disabled={entry.status === 'voided'}
          onClick={() => void onVoid(entry.id, voidReason)}
        >
          Void points
        </button>
      </td>
    </tr>
  ));
  return (
    <section aria-label="Points ledger">
      <h3>Points ledger</h3>
      <label className="field">
        <span>Void reason</span>
        <input
          data-testid="ledger__void-reason-input"
          type="text"
          value={voidReason}
          onChange={(event) => setVoidReason(event.target.value)}
        />
      </label>
      {graph.pointsEntries.length === 0 ? (
        <p data-testid="ledger__empty">No points awarded yet. Finalise a match or assign points directly.</p>
      ) : (
        <table className="table" data-testid="ledger__table">
          <thead>
            <tr><th>Team</th><th>Points</th><th>Reason</th><th>Status</th><th /></tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      )}
    </section>
  );
}
