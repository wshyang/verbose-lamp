import { Link } from 'react-router-dom';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { StaffShell } from './StaffShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { useStationPicker } from '../lib/hooks/useStaffTools.js';
import { useModeAsk } from '../lib/hooks/useModeAsk.js';
import { ModeAskPanel } from '../components/console/ModeAskPanel.js';
import { useSession } from '../lib/session/context.js';

/**
 * S19 landing + S20 station switcher (F31/F32). The default station from the account is
 * highlighted, but any station can be picked — facilitators rotate on the day.
 */
export function StaffHomePage() {
  const { session } = useSession();
  const picker = useStationPicker();
  const modeAsk = useModeAsk();
  const help = useFieldHelp();
  const defaultStationId = session?.defaultStation?.id ?? null;

  return (
    <StaffShell title="Stations">
      <section className="console-panel">
        <h2>
          Pick your station <FieldHelp label="Picking a station" topic="stationPicker" help={help} />
        </h2>
        <StateMessage
          isLoading={picker.isLoading}
          error={picker.error}
          isEmpty={picker.stations.length === 0}
          emptyText="No stations configured yet — ask a superadmin to add courts or activities."
          testId="staff-home"
        />
        <div className="console-grid" aria-describedby={help.tooltipId}>
          {picker.stations.map((station) => (
            <Link
              key={`${station.kind}-${station.id}`}
              className="console-button console-button--huge"
              data-testid="staff-home__station"
              to={stationPath(station)}
            >
              <span>
                {station.label}
                {station.id === defaultStationId ? ' ★' : ''}
              </span>
              <span className="console-meta">
                {station.isEnabled ? station.detail : 'Disabled'}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <ModeAskPanel ask={modeAsk} />
    </StaffShell>
  );
}

function stationPath(station: { kind: string; id: string }): string {
  if (station.kind === 'dumb_court') return `/staff/dumb-court/${station.id}`;
  if (station.kind === 'court') return `/staff/court/${station.id}`;
  if (station.kind === 'swag_station') return `/staff/swag/${station.id}`;
  return `/staff/activity/${station.id}`;
}
