import type { MatchView, ScheduledMatch } from '../../../shared/types.js';
import { formatMinutes } from '../../../shared/time.js';
import { columnsFor, linkDescriptions, phaseTone, slotDisplay, type SlotContext } from '../lib/formatUi.js';

interface Props {
  matches: (ScheduledMatch | MatchView)[];
  context?: SlotContext;
}

function courtLabel(match: ScheduledMatch | MatchView): string {
  if ('courtName' in match) return match.courtName ?? 'No court (bye)';
  return match.court === null ? 'No court (bye)' : `Court ${match.court}`;
}

function MatchCard({ match, context }: { match: ScheduledMatch | MatchView; context?: SlotContext }) {
  const links = linkDescriptions(match);
  const linkChips = links.map((link) => (
    <span key={link} className="link-chip">↳ {link}</span>
  ));
  const timeLabel = match.startMinutes === null
    ? 'Bye — no court time'
    : `${formatMinutes(match.startMinutes)} – ${formatMinutes(match.endMinutes as number)}`;
  return (
    <article className={`match-card ${phaseTone(match.phase)}`} data-testid="bracket__match-card">
      <header>
        <strong>{match.key}</strong>
        <span>{match.phase}</span>
      </header>
      <p className="slot">{slotDisplay(match.slotA, context)}</p>
      <p className="versus">vs</p>
      <p className="slot">{slotDisplay(match.slotB, context)}</p>
      <footer>
        <span>{courtLabel(match)}</span>
        <span>{timeLabel}</span>
      </footer>
      {'isBackToBack' in match && match.isBackToBack ? (
        <p className="warning">⚠ Back-to-back: no rest after the previous match</p>
      ) : null}
      {linkChips.length === 0 ? null : <div className="links">{linkChips}</div>}
    </article>
  );
}

export default function BracketView({ matches, context }: Props) {
  const columns = columnsFor(matches);
  const columnElements = columns.map((column) => (
    <div key={column.round} className="bracket-column">
      <h3>
        Round {column.round}
        <small>{column.title}</small>
      </h3>
      <div className="column-cards">
        {column.matches.map((match) => (
          <MatchCard key={match.key} match={match} context={context} />
        ))}
      </div>
    </div>
  ));
  if (matches.length === 0) return <p data-testid="bracket__empty">No matches to show yet.</p>;
  return (
    <div className="bracket" data-testid="bracket__columns">
      {columnElements}
      <span className="bracket-arrow" aria-hidden="true">➜ winners flow left to right</span>
    </div>
  );
}
