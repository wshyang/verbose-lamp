import { useState } from 'react';
import type { TournamentGraph } from '../../../shared/types.js';
import { slotDisplay } from '../lib/formatUi.js';

export interface MatchActions {
  startMatch: (matchId: string) => Promise<void>;
  scoreMatch: (matchId: string, scoreA: number, scoreB: number) => Promise<void>;
  finaliseMatch: (matchId: string) => Promise<void>;
  cancelMatch: (matchId: string) => Promise<void>;
}

interface RowProps {
  graph: TournamentGraph;
  match: TournamentGraph['matches'][number];
  actions: MatchActions;
}

function MatchRow({ graph, match, actions }: RowProps) {
  const [scoreA, setScoreA] = useState(match.scoreA === null ? '' : String(match.scoreA));
  const [scoreB, setScoreB] = useState(match.scoreB === null ? '' : String(match.scoreB));
  const context = { teams: graph.teams, matches: graph.matches };
  const saveScore = () => {
    void actions.scoreMatch(match.id, Number(scoreA), Number(scoreB));
  };
  return (
    <tr data-testid="desk__match-row">
      <td>{match.key}</td>
      <td>{match.phase}</td>
      <td>{slotDisplay(match.slotA, context)}</td>
      <td>{slotDisplay(match.slotB, context)}</td>
      <td>{match.courtName ?? '—'}</td>
      <td>{match.status}</td>
      <td>
        <input
          data-testid="desk__score-a-input"
          aria-label={`Score A for ${match.key}`}
          type="number"
          min={0}
          value={scoreA}
          onChange={(event) => setScoreA(event.target.value)}
        />
        {' : '}
        <input
          data-testid="desk__score-b-input"
          aria-label={`Score B for ${match.key}`}
          type="number"
          min={0}
          value={scoreB}
          onChange={(event) => setScoreB(event.target.value)}
        />
      </td>
      <td className="row-actions">
        <button type="button" data-testid="desk__start-button" onClick={() => void actions.startMatch(match.id)}>Start</button>
        <button type="button" data-testid="desk__save-score-button" onClick={saveScore}>Save live score</button>
        <button type="button" data-testid="desk__finalise-button" onClick={() => void actions.finaliseMatch(match.id)}>Finalise</button>
        <button type="button" data-testid="desk__cancel-button" onClick={() => void actions.cancelMatch(match.id)}>Cancel</button>
      </td>
    </tr>
  );
}

interface Props { graph: TournamentGraph; actions: MatchActions }

export default function MatchDeskTable({ graph, actions }: Props) {
  const rows = graph.matches.map((match) => (
    <MatchRow key={match.id} graph={graph} match={match} actions={actions} />
  ));
  return (
    <table className="table" data-testid="desk__match-table">
      <thead>
        <tr>
          <th>Match</th><th>Phase</th><th>Slot A</th><th>Slot B</th>
          <th>Court</th><th>Status</th><th>Score</th><th>Desk actions</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}
