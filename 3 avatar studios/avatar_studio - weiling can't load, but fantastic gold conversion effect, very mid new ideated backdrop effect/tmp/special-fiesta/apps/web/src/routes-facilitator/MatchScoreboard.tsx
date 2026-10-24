import type { MatchView } from '@psd/contracts';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';

/**
 * ADR-114 — the live score, one team on each side of the court, exactly as the marshal is
 * standing and looking at it.
 */

const WINDOW_SIZE = 5;

/**
 * The five numbers under a team name, centred on where that team actually is.
 *
 * Centring rather than scrolling is what removes the arrows: a captain's ball rally moves
 * the score by one, so the only two numbers a marshal can ever need are the neighbours of
 * the current one, and both are always on screen. Near zero the window stops rather than
 * showing negative scores, so the current value sits off-centre at the start of a match
 * and settles into the middle as soon as there is room.
 */
export function scoreWindow(current: number, size: number = WINDOW_SIZE): number[] {
  const start = Math.max(0, current - Math.floor(size / 2));
  return Array.from({ length: size }, (_, index) => start + index);
}

interface ScoreSideProps {
  side: 'a' | 'b';
  teamName: string;
  score: number;
  isLeading: boolean;
  onPick: (side: 'a' | 'b', to: number) => void;
}

function ScoreSide({ side, teamName, score, isLeading, onPick }: ScoreSideProps) {
  return (
    <div className="scoreboard__side" data-testid={`court__side-${side}`}>
      <h3 className="scoreboard__team" data-testid={`court__team-${side}`}>
        {teamName}
      </h3>
      <p
        className={isLeading ? 'scoreboard__score scoreboard__score--leading' : 'scoreboard__score'}
        data-testid={`court__score-${side}`}
      >
        {score}
      </p>
      <div className="scoreboard__strip" role="group" aria-label={`Score for ${teamName}`}>
        {scoreWindow(score).map((value) => {
          const isCurrent = value === score;
          return (
            <button
              key={value}
              type="button"
              className={
                isCurrent ? 'scoreboard__step scoreboard__step--current' : 'scoreboard__step'
              }
              data-testid={`court__step-${side}-${value}`}
              /*
               * A rally is worth one point and a marshal only ever needs to undo the last
               * one, so every other number is unreachable by design: there is no gesture
               * here that can invent a score nobody played.
               */
              disabled={Math.abs(value - score) !== 1}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={`${teamName} ${value}`}
              onClick={() => onPick(side, value)}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface MatchScoreboardProps {
  match: MatchView;
  scoreA: number;
  scoreB: number;
  leadingTeamId: string | null;
  onPick: (side: 'a' | 'b', to: number) => void;
}

export function MatchScoreboard(props: MatchScoreboardProps) {
  const { match, scoreA, scoreB, leadingTeamId, onPick } = props;
  const help = useFieldHelp();
  return (
    <div className="scoreboard" data-testid="court__scoreboard" aria-describedby={help.tooltipId}>
      <FieldHelp label="Scoring" topic="courtScore" help={help} />
      <ScoreSide
        side="a"
        teamName={match.teamAName}
        score={scoreA}
        isLeading={leadingTeamId === match.teamAId}
        onPick={onPick}
      />
      <ScoreSide
        side="b"
        teamName={match.teamBName}
        score={scoreB}
        isLeading={leadingTeamId === match.teamBId}
        onPick={onPick}
      />
    </div>
  );
}
