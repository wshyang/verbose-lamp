import { NavLink } from 'react-router-dom';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import type { FixtureView } from '@psd/contracts';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatTime } from '../lib/format.js';
import { seatName, useCourtLineups } from '../lib/hooks/useCourtLineups.js';
import { useRouteId } from '../lib/hooks/useRouteId.js';
import { StaffShell } from '../routes-facilitator/StaffShell.js';

/**
 * ADR-284 — the court console's Line-ups subtab: this court's planned matches, next first, with who
 * plays (or where a seat will come from) and when. A cut-down Timetable for the one court the marshal
 * is standing at; the console itself (`/staff/court/:courtId`) is unchanged.
 */

function CourtTabs(props: { courtId: string }) {
  return (
    <nav className="console-tabs" aria-label="Court sections" data-testid="court-tabs">
      <NavLink to={`/staff/court/${props.courtId}`} end data-testid="court-tabs__console">
        Console
      </NavLink>
      <NavLink to={`/staff/court/${props.courtId}/lineups`} data-testid="court-tabs__lineups">
        Line-ups
      </NavLink>
    </nav>
  );
}

export function whenOf(fixture: FixtureView): string {
  if (fixture.status === 'claimed') return 'On court now';
  const at = fixture.estimatedStartAt;
  return at === null || at === undefined ? 'Time to be set' : formatTime(at);
}

function LineupRow(props: { fixture: FixtureView; isNext: boolean }) {
  const { fixture } = props;
  return (
    <li className={props.isNext ? 'console-panel console-status--warn' : 'console-panel'} data-testid="court-lineups__row">
      <div className="console-row console-row--between">
        <strong>
          #{fixture.sequence} {seatName(fixture, 'a')} v {seatName(fixture, 'b')}
        </strong>
        <span className="console-meta">{whenOf(fixture)}</span>
      </div>
      {props.isNext ? <p className="console-meta">Up next on this court</p> : null}
    </li>
  );
}

export function CourtLineupsPage() {
  const courtId = useRouteId('courtId');
  const lineups = useCourtLineups(courtId);
  const help = useFieldHelp();
  return (
    <StaffShell title={lineups.title}>
      <CourtTabs courtId={courtId} />
      <p className="console-row">
        Planned here, next first <FieldHelp label="Court line-ups" topic="courtLineupStart" help={help} />
      </p>
      <StateMessage
        isLoading={lineups.isLoading}
        error={lineups.error}
        isEmpty={lineups.items.length === 0}
        emptyText="Nothing planned on this court yet."
        testId="court-lineups"
      />
      <ol className="console-list" data-testid="court-lineups">
        {lineups.items.map((fixture, position) => (
          <LineupRow key={fixture.id} fixture={fixture} isNext={position === 0} />
        ))}
      </ol>
    </StaffShell>
  );
}
