import type { MatchSection } from '../presentation.js';
import type { MatchView } from '../../shared/contracts.js';
import { MatchCard } from './MatchCard.js';

interface MatchMapProps {
  sections: MatchSection[];
  matches: MatchView[];
  interactive?: boolean;
  disabled?: boolean;
  onSaveScore?: (matchId: string, score: { home: number; away: number }) => Promise<void>;
  onFinalize?: (matchId: string, result: { home: number; away: number; advancingTeamId?: string }) => Promise<void>;
}

export function MatchMap({
  sections,
  matches,
  interactive = false,
  disabled = false,
  onSaveScore,
  onFinalize,
}: MatchMapProps) {
  const matchesById = new Map(matches.map((match) => [match.id, match]));
  const isEmpty = matches.length === 0;

  if (isEmpty) {
    return (
      <div className="empty-state" data-testid="match-map__empty">
        <span className="empty-state__icon">＋</span>
        <h3>No matches staged yet</h3>
        <p>Stage the first matchup from the desk when both teams are ready.</p>
      </div>
    );
  }

  return (
    <div className="match-map" data-testid="match-map">
      <div className="match-map__legend">
        <span><i className="legend-dot legend-dot--direct" /> Team entered</span>
        <span><i className="legend-dot legend-dot--linked" /> Winner, loser, or standing slot</span>
        <span>{matches.length} matches · connected by result references</span>
      </div>
      <div className="match-map__sections">
        {sections.map((section) => (
          <section className="match-section" id={section.key.startsWith('group-') ? section.key : undefined} key={section.key}>
            <header className="match-section__header">
              <div>
                <p className="eyebrow">Match pathway</p>
                <h3 id={section.key.startsWith('round-') ? section.key : undefined}>{section.title}</h3>
              </div>
              <span className="match-section__count">{section.matches.length}</span>
            </header>
            <div className="match-section__grid">
              {section.matches.map((match) => (
                <MatchCard
                  disabled={disabled}
                  interactive={interactive}
                  key={match.id}
                  match={match}
                  matchesById={matchesById}
                  onFinalize={onFinalize}
                  onSaveScore={onSaveScore}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
