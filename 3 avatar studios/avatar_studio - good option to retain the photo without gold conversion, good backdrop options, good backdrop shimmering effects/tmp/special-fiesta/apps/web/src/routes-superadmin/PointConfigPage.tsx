import { useEffect } from 'react';
import { ConsoleField } from '../components/console/ConsoleField.js';
import type { PointConfigView } from '@psd/contracts';
import { AdminShell } from './AdminShell.js';
import { formatDateTime } from '../lib/format.js';
import { useAdminPointConfig } from '../lib/hooks/useAdminConfig.js';

/**
 * S36 — the day's fringe point settings (ADR-116, ADR-176). Editing them never rewrites history:
 * a scan keeps the points it was awarded. ADR-270 — the tournament's rates are set on the
 * tournament itself, not here.
 */
export function PointConfigPage() {
  const config = useAdminPointConfig();
  const { current, startEditing } = config;

  // Prefill from the saved values, or from the suggested defaults before anything is saved.
  useEffect(() => startEditing(), [current, startEditing]);

  return (
    <AdminShell title="Points">
      <section className="console-panel">
        <h2>Current values</h2>
        <CurrentValues isLoading={config.isLoading} current={current} />
      </section>

      <section className="console-panel">
        <h2>Update</h2>
        <form
          data-testid="point-config__form"
          onSubmit={(event) => {
            event.preventDefault();
            void config.submit();
          }}
        >
          <ConsoleField id="participation-points" label="Participation points (taking part, without placing)" topic="participationPoints">
          <input
            id="participation-points"
            className="console-input"
            data-testid="point-config__participation-points"
            inputMode="numeric"
            value={config.participationPoints}
            onChange={(event) =>
              config.setParticipationPoints(event.target.value.replace(/\D/g, ''))
            }
          />
          </ConsoleField>
          {/* ADR-176 — one bonus for visiting this many DISTINCT stations. 0 turns it off. */}
          <ConsoleField id="passport-bonus-points" label="Passport bonus (0 for none)" topic="passportBonus">
          <input
            id="passport-bonus-points"
            className="console-input"
            data-testid="point-config__passport-bonus"
            inputMode="numeric"
            value={config.passportBonusPoints}
            onChange={(event) =>
              config.setPassportBonusPoints(event.target.value.replace(/\D/g, ''))
            }
          />
          </ConsoleField>
          <ConsoleField id="passport-stations" label="Stations needed for the passport" topic="passportStationCount">
          <input
            id="passport-stations"
            className="console-input"
            data-testid="point-config__passport-stations"
            inputMode="numeric"
            value={config.passportStations}
            onChange={(event) =>
              config.setPassportStations(event.target.value.replace(/\D/g, ''))
            }
          />
          </ConsoleField>
          {config.error ? (
            <p className="console-danger" role="alert" data-testid="point-config__error">
              {config.error}
            </p>
          ) : null}
          <div style={{ height: 16 }} />
          <button
            type="submit"
            className="console-button console-button--primary"
            data-testid="point-config__save"
            disabled={config.isSaving}
          >
            Save point settings
          </button>
        </form>
        <p className="console-muted" style={{ marginTop: 12 }}>
          Scans already made keep the points they were awarded.
        </p>
      </section>
    </AdminShell>
  );
}

/** ADR-099 — the unset notice waits for the config response instead of flashing on every visit. */
function CurrentValues(props: { isLoading: boolean; current: PointConfigView | null }) {
  if (props.isLoading) {
    return (
      <p className="loading" data-testid="point-config__loading">
        Loading…
      </p>
    );
  }
  if (props.current) {
    return (
      <p data-testid="point-config__current">
        Took part {props.current.fringeParticipationPoints} · passport{' '}
        {props.current.fringePassportBonusPoints} for {props.current.fringePassportStations}{' '}
        stations · updated {formatDateTime(props.current.updatedAt)} by{' '}
        {props.current.updatedByUsername}
      </p>
    );
  }
  return (
    <p className="console-warning" data-testid="point-config__unset">
      Not set yet. Stations pay the suggested defaults until you save values here.
    </p>
  );
}
