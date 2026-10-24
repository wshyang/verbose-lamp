import type { MatchView, ScheduledMatch } from '../../../shared/types.js';
import { formatMinutes } from '../../../shared/time.js';
import { slotDisplay, type SlotContext } from '../lib/formatUi.js';

interface Props {
  matches: (ScheduledMatch | MatchView)[];
  context?: SlotContext;
}

function courtOf(match: ScheduledMatch | MatchView): string {
  if ('courtName' in match) return match.courtName ?? '—';
  return match.court === null ? '—' : `Court ${match.court}`;
}

export default function TimelineTable({ matches, context }: Props) {
  const sorted = [...matches].sort((a, b) => {
    const startA = a.startMinutes ?? Number.MAX_SAFE_INTEGER;
    const startB = b.startMinutes ?? Number.MAX_SAFE_INTEGER;
    return startA - startB || a.key.localeCompare(b.key);
  });
  const rows = sorted.map((match) => (
    <tr key={match.key} data-testid="timeline__row">
      <td>{match.startMinutes === null ? 'Bye' : formatMinutes(match.startMinutes)}</td>
      <td>{match.endMinutes === null ? '—' : formatMinutes(match.endMinutes)}</td>
      <td>{courtOf(match)}</td>
      <td>{match.key}</td>
      <td>{match.phase}</td>
      <td>{slotDisplay(match.slotA, context)}</td>
      <td>{slotDisplay(match.slotB, context)}</td>
    </tr>
  ));
  return (
    <table className="table" data-testid="timeline__table">
      <thead>
        <tr>
          <th>Start</th><th>End</th><th>Court</th><th>Match</th>
          <th>Phase</th><th>Slot A</th><th>Slot B</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}
