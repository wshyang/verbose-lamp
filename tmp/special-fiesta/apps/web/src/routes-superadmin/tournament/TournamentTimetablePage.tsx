import type { AdminMatchView } from '@psd/contracts';
import { StateMessage } from '../../components/shared/StateMessage.js';
import { useTournamentTimetable, type LaneBlock } from '../../lib/hooks/useTournamentTimetable.js';
import { AdminShell } from '../AdminShell.js';
import { fitLine } from './DayPanel.js';
import { scoreLine, seatLabel, timeOf } from './MatchesPanel.js';
import { TournamentTabs } from './TournamentTabs.js';

/**
 * ADR-279 — the Timetable subtab: every court across the day, one lane each, with a now-line. A block
 * is a match where the planner (or a person) has put it; its state says whether it is played, on court
 * or still to come, and "(pinned)" says a person put it there. Text only, as the console is (§5.5).
 */

export function blockLabel(match: AdminMatchView): string {
  const pin = match.isPinned ? ' (pinned)' : '';
  return `${match.code} ${seatLabel(match.a)} v ${seatLabel(match.b)} · ${timeOf(match.startedAt ?? match.plannedStartAt)}${pin}`;
}

const BLOCK_CLASSES: Record<AdminMatchView['status'], string> = {
  scheduled: 'timetable-block',
  in_progress: 'timetable-block timetable-block--live',
  completed: 'timetable-block timetable-block--done',
  cancelled: 'timetable-block timetable-block--off',
};

function Block(props: { block: LaneBlock }) {
  const { match, left, width } = props.block;
  const style = { left: `${left * 100}%`, width: `${width * 100}%` };
  const title = `${blockLabel(match)} — ${scoreLine(match)}`;
  return (
    <div className={BLOCK_CLASSES[match.status]} style={style} title={title} data-testid="timetable__block" data-status={match.status}>
      {match.code}
    </div>
  );
}

function Unplaced(props: { matches: readonly AdminMatchView[] }) {
  if (props.matches.length === 0) return null;
  return (
    <section className="console-panel" data-testid="timetable__unplaced">
      <h2>Not yet placed ({props.matches.length})</h2>
      <ul className="console-list">
        {props.matches.map((match) => (
          <li key={match.id}>{blockLabel(match)}</li>
        ))}
      </ul>
    </section>
  );
}

export function TournamentTimetablePage() {
  const timetable = useTournamentTimetable();
  const marks = timetable.axis?.marks ?? [];
  const nowStyle = { left: `${(timetable.axis?.now ?? 0) * 100}%` };
  return (
    <AdminShell title="Tournament">
      <TournamentTabs />
      <StateMessage
        isLoading={timetable.isLoading}
        error={timetable.error}
        isEmpty={timetable.lanes.length === 0}
        emptyText="No courts yet — add one on the Control tab."
        testId="timetable"
      />
      <p className="console-meta" data-testid="timetable__fit">
        {fitLine(timetable.fit)}
      </p>
      <section className="console-panel timetable" data-testid="timetable">
        <div className="timetable-axis">
          {marks.map((mark) => (
            <span key={mark.label} className="timetable-mark" style={{ left: `${mark.at * 100}%` }}>
              {mark.label}
            </span>
          ))}
        </div>
        {timetable.lanes.map((lane) => (
          <div key={lane.court.id} className="timetable-lane" data-testid="timetable__lane" data-enabled={lane.court.isEnabled ? 'true' : 'false'}>
            <span className="timetable-court">{lane.court.label}</span>
            <div className="timetable-track">
              {lane.blocks.map((block) => (
                <Block key={block.match.id} block={block} />
              ))}
              <span className="timetable-now" style={nowStyle} data-testid="timetable__now" />
            </div>
          </div>
        ))}
      </section>
      <Unplaced matches={timetable.unplaced} />
    </AdminShell>
  );
}
