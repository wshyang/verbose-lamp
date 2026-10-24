import { useEffect, useState, type ReactElement } from 'react';
import { ArrowDownRight, Clock3, MapPin } from 'lucide-react';
import type { FinalizeMatchInput, LiveScoreInput, MatchView, ParticipantSlot } from '../../shared/contracts.js';
import { formatClock } from '../presentation.js';

interface MatchCardProps {
  match: MatchView;
  matchesById: Map<string, MatchView>;
  interactive: boolean;
  disabled?: boolean;
  onSaveScore?: ((matchId: string, score: LiveScoreInput) => Promise<void>) | undefined;
  onFinalize?: ((matchId: string, result: FinalizeMatchInput) => Promise<void>) | undefined;
}

export function MatchCard({
  match,
  matchesById,
  interactive,
  disabled = false,
  onSaveScore,
  onFinalize,
}: MatchCardProps) {
  const [homeScore, setHomeScore] = useState(scoreText(match.score?.home));
  const [awayScore, setAwayScore] = useState(scoreText(match.score?.away));
  const [advancingTeamId, setAdvancingTeamId] = useState('');
  const homeParticipant = match.participants[0];
  const awayParticipant = match.participants[1];
  const isResolved = Boolean(homeParticipant.resolvedTeamId && awayParticipant.resolvedTeamId);
  const canEnterScore = isResolved && ['staged', 'live'].includes(match.status) && !disabled;
  const isLive = match.status === 'live';
  const hasTie = homeScore !== '' && awayScore !== '' && Number(homeScore) === Number(awayScore);
  const dependencyMatches = match.dependsOn.flatMap((id) => {
    const source = matchesById.get(id);
    return source ? [source] : [];
  });

  useEffect(() => {
    setHomeScore(scoreText(match.score?.home));
    setAwayScore(scoreText(match.score?.away));
  }, [match.score?.home, match.score?.away]);

  async function saveScore(): Promise<void> {
    if (!canEnterScore || !onSaveScore) return;
    await onSaveScore(match.id, { home: Number(homeScore), away: Number(awayScore) });
  }

  async function finalizeScore(): Promise<void> {
    if (!isLive || !onFinalize) return;
    const result: FinalizeMatchInput = { home: Number(homeScore), away: Number(awayScore) };
    if (advancingTeamId) result.advancingTeamId = advancingTeamId;
    await onFinalize(match.id, result);
  }

  return (
    <article className={`match-card ${match.status === 'final' ? 'match-card--final' : ''}`} id={`match-${match.id}`}>
      <header className="match-card__header">
        <div>
          <span className="match-card__code">{match.code}</span>
          <span className="match-card__phase">{match.phase}</span>
        </div>
        <span className={`status-pill status-pill--${match.status}`}>{statusLabel(match.status)}</span>
      </header>
      <div className="match-card__teams">
        <div className="match-card__team">
          <ParticipantLabel slot={homeParticipant.reference} matchesById={matchesById} />
          <TeamScore score={match.score?.home} />
        </div>
        <div className="match-card__team">
          <ParticipantLabel slot={awayParticipant.reference} matchesById={matchesById} />
          <TeamScore score={match.score?.away} />
        </div>
      </div>
      <div className="match-card__schedule">
        <span><Clock3 size={14} /> {formatClock(match.schedule.startMinute)}–{formatClock(match.schedule.endMinute)}</span>
        <span><MapPin size={14} /> Court {match.schedule.courtNumber}</span>
      </div>
      {dependencyMatches.length > 0 && (
        <div className="match-card__dependencies" aria-label={`Match ${match.code} follows earlier matches`}>
          <ArrowDownRight size={14} />
          <span>Linked from</span>
          {dependencyMatches.slice(0, 3).map((source) => (
            <a key={source.id} href={`#match-${source.id}`} data-testid="match-card__dependency-link">
              {source.code}
            </a>
          ))}
          {dependencyMatches.length > 3 && <span>+{dependencyMatches.length - 3}</span>}
        </div>
      )}
      {interactive && canEnterScore && (
        <section className="match-card__score-entry" aria-label={`Score entry for ${match.code}`}>
          <label>
            <span className="visually-hidden">{homeParticipant.displayName} score</span>
            <input
              aria-label={`${homeParticipant.displayName} score`}
              data-testid="match-card__home-score"
              inputMode="numeric"
              max="999"
              min="0"
              onChange={(event) => setHomeScore(event.target.value)}
              type="number"
              value={homeScore}
            />
          </label>
          <span className="score-entry__divider">—</span>
          <label>
            <span className="visually-hidden">{awayParticipant.displayName} score</span>
            <input
              aria-label={`${awayParticipant.displayName} score`}
              data-testid="match-card__away-score"
              inputMode="numeric"
              max="999"
              min="0"
              onChange={(event) => setAwayScore(event.target.value)}
              type="number"
              value={awayScore}
            />
          </label>
          <button className="button button--quiet" data-testid="match-card__save-score" onClick={() => void saveScore()}>
            {isLive ? 'Update live score' : 'Start & save score'}
          </button>
          {isLive && hasTie && (
            <label className="match-card__advance">
              <span>Team advancing on a tie</span>
              <select
                aria-label="Team advancing on a tie"
                data-testid="match-card__advancing-team"
                onChange={(event) => setAdvancingTeamId(event.target.value)}
                value={advancingTeamId}
              >
                <option value="">Choose if needed</option>
                <option value={homeParticipant.resolvedTeamId!}>{homeParticipant.displayName}</option>
                <option value={awayParticipant.resolvedTeamId!}>{awayParticipant.displayName}</option>
              </select>
            </label>
          )}
          {isLive && (
            <button className="button button--primary" data-testid="match-card__finalize" onClick={() => void finalizeScore()}>
              Finalise result
            </button>
          )}
        </section>
      )}
      {interactive && !isResolved && match.status !== 'final' && (
        <p className="match-card__waiting">Waiting for the linked match or group table to decide these teams.</p>
      )}
      {interactive && match.status === 'final' && (
        <p className="match-card__waiting">Result final · points are recorded in the event ledger.</p>
      )}
    </article>
  );
}

interface ParticipantLabelProps {
  slot: ParticipantSlot;
  matchesById: Map<string, MatchView>;
}

function ParticipantLabel({ slot, matchesById }: ParticipantLabelProps) {
  if (slot.kind === 'winner' || slot.kind === 'loser') {
    const source = matchesById.get(slot.matchId);
    return <a className="participant-link" data-testid="match-card__participant-link" href={`#match-${slot.matchId}`}>{source?.code ?? slot.matchCode} · {slot.kind}</a>;
  }
  if (slot.kind === 'group-rank') {
    return <a className="participant-link" data-testid="match-card__participant-link" href={`#group-${slot.groupKey.toLowerCase()}`}>{slot.label}</a>;
  }
  if (slot.kind === 'group-winner-rank') {
    return (
      <span className="participant-link">
        {slot.label} · {slot.groupKeys.map((groupKey) => (
          <a data-testid="match-card__participant-link" href={`#group-${groupKey.toLowerCase()}`} key={groupKey}>{groupKey}</a>
        ))}
      </span>
    );
  }
  if (slot.kind === 'swiss-pairing') {
    return <a className="participant-link" data-testid="match-card__participant-link" href={`#round-${slot.afterRound}`}>{slot.label}</a>;
  }
  return <span className="participant-name">{slot.label}</span>;
}

function TeamScore({ score }: { score: number | undefined }): ReactElement | null {
  if (score === undefined) return null;
  return <strong className="match-card__score">{score}</strong>;
}

function scoreText(score: number | undefined): string {
  return score === undefined ? '' : String(score);
}

function statusLabel(status: MatchView['status']): string {
  if (status === 'live') return 'Live';
  if (status === 'final') return 'Final';
  if (status === 'cancelled') return 'Called off';
  return 'Staged';
}
