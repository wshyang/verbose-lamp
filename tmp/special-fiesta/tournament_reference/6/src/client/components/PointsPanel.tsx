import { useState } from 'react';
import { BadgePlus, CircleOff, Coins } from 'lucide-react';
import type { AwardPointsInput, PointEntry, TeamRecord } from '../../shared/contracts.js';

interface PointsPanelProps {
  teams: TeamRecord[];
  entries: PointEntry[];
  disabled: boolean;
  busy: boolean;
  onAward: (input: AwardPointsInput) => Promise<void>;
  onVoid: (entryId: string, reason: string) => Promise<void>;
}

export function PointsPanel({ teams, entries, disabled, busy, onAward, onVoid }: PointsPanelProps) {
  const activeTeams = teams.filter((team) => team.withdrawnAt === null);
  const [teamId, setTeamId] = useState(activeTeams[0]?.id ?? '');
  const [points, setPoints] = useState('1');
  const [reason, setReason] = useState('Desk award');
  const canAward = !disabled && !busy && Boolean(teamId && Number(points) > 0 && reason.trim());
  const visibleEntries = [...entries].reverse();

  async function submitAward(): Promise<void> {
    await onAward({ teamId, points: Number(points), reason });
  }

  function canVoid(entry: PointEntry): boolean {
    return !disabled && !busy && entry.kind !== 'void' && !entry.voided && reason.trim().length > 0;
  }

  return (
    <section className="points-card" aria-labelledby="points-title">
      <div className="points-card__heading">
        <div className="points-card__icon"><Coins size={18} /></div>
        <div>
          <p className="eyebrow">Event ledger</p>
          <h3 id="points-title">Team points</h3>
        </div>
      </div>
      <p className="points-card__copy">Match outcomes add the event’s standard points. Desk awards and reversals remain visible in the ledger.</p>
      <div className="points-award-form">
        <label className="field">
          <span>Team</span>
          <select data-testid="points-panel__team" disabled={disabled} onChange={(event) => setTeamId(event.target.value)} value={teamId}>
            {activeTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Points</span>
          <input data-testid="points-panel__amount" disabled={disabled} max="10000" min="1" onChange={(event) => setPoints(event.target.value)} type="number" value={points} />
        </label>
        <label className="field field--wide">
          <span>Reason</span>
          <input data-testid="points-panel__reason" disabled={disabled} maxLength={500} onChange={(event) => setReason(event.target.value)} value={reason} />
        </label>
        <button className="button button--primary button--full" data-testid="points-panel__award" disabled={!canAward} onClick={() => void submitAward()}>
          <BadgePlus size={16} /> Award points
        </button>
      </div>
      <div className="ledger-list" data-testid="points-panel__ledger">
        {visibleEntries.length === 0 ? (
          <p className="ledger-empty">No point movements yet.</p>
        ) : visibleEntries.map((entry) => (
          <article className={`ledger-entry ${entry.voided ? 'ledger-entry--voided' : ''}`} key={entry.id}>
            <div>
              <strong>{entry.teamName}</strong>
              <p>{entry.reason}</p>
              <small>{entry.kind === 'outcome-award' ? 'Match result' : entry.kind === 'void' ? 'Reversal' : 'Desk award'}</small>
            </div>
            <div className="ledger-entry__actions">
              <b>{entry.points > 0 ? '+' : ''}{entry.points}</b>
              {entry.voided && <span className="void-label">Voided</span>}
              {canVoid(entry) && (
                <button aria-label={`Void ${entry.points} points for ${entry.teamName}`} className="icon-button icon-button--danger" data-testid="points-panel__void" onClick={() => void onVoid(entry.id, reason)}>
                  <CircleOff size={15} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="points-card__footnote">Voiding adds a reversal; it never erases the original award.</p>
    </section>
  );
}
