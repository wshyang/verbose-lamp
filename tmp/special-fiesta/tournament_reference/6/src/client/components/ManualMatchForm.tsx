import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { StageMatchInput, TeamRecord } from '../../shared/contracts.js';

interface ManualMatchFormProps {
  teams: TeamRecord[];
  disabled: boolean;
  onStage: (input: StageMatchInput) => Promise<void>;
}

export function ManualMatchForm({ teams, disabled, onStage }: ManualMatchFormProps) {
  const availableTeams = teams.filter((team) => team.withdrawnAt === null);
  const [homeTeamId, setHomeTeamId] = useState(availableTeams[0]?.id ?? '');
  const [awayTeamId, setAwayTeamId] = useState(availableTeams[1]?.id ?? '');
  const [phase, setPhase] = useState('Desk-staged');
  const canStage = !disabled && homeTeamId !== awayTeamId && Boolean(homeTeamId && awayTeamId);

  async function submitMatch(): Promise<void> {
    await onStage({ homeTeamId, awayTeamId, phase });
  }

  return (
    <section className="tool-card" aria-labelledby="manual-match-title">
      <div className="tool-card__heading">
        <div>
          <p className="eyebrow">At the desk</p>
          <h3 id="manual-match-title">Stage a matchup</h3>
        </div>
        <Plus size={18} />
      </div>
      <p className="tool-card__copy">Pick two active teams. The next open court slot is assigned automatically.</p>
      <div className="manual-match-fields">
        <label className="field">
          <span>Team one</span>
          <select data-testid="manual-match__home-team" onChange={(event) => setHomeTeamId(event.target.value)} value={homeTeamId}>
            {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Team two</span>
          <select data-testid="manual-match__away-team" onChange={(event) => setAwayTeamId(event.target.value)} value={awayTeamId}>
            {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label className="field field--wide">
          <span>Match label</span>
          <input data-testid="manual-match__phase" maxLength={80} onChange={(event) => setPhase(event.target.value)} value={phase} />
        </label>
      </div>
      <button className="button button--primary button--full" data-testid="manual-match__stage" disabled={!canStage} onClick={() => void submitMatch()}>
        Stage match
      </button>
      {availableTeams.length < 2 && <p className="inline-note">Two active teams are needed to stage a match.</p>}
    </section>
  );
}
