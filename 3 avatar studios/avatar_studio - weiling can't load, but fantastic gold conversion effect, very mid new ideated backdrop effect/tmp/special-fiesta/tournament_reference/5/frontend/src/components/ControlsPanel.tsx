import { FORMATS } from '../../../shared/formats/index.js';
import type { SimulationState } from '../lib/hooks/useSimulation.js';
import { modeMeta } from '../lib/formatUi.js';

interface Props { simulation: SimulationState }

function NumberField(props: {
  testId: string; label: string; value: number; min: number; max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        data-testid={props.testId}
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function ControlsPanel({ simulation }: Props) {
  const meta = modeMeta(simulation.mode);
  const formatOptions = FORMATS.map((format) => (
    <option key={format.id} value={format.id}>{format.name}</option>
  ));
  return (
    <section className="panel" aria-label="Tournament controls">
      <label className="field field-wide">
        <span>Tournament mode</span>
        <select
          data-testid="controls__mode-select"
          value={simulation.mode}
          onChange={(event) => simulation.setMode(event.target.value)}
        >
          {formatOptions}
        </select>
      </label>
      <p className="tagline" style={{ borderLeftColor: meta.accent }}>{meta.tagline}</p>
      <div className="field-grid">
        <NumberField testId="controls__teams-input" label="Teams" value={simulation.teamCount} min={2} max={32} onChange={simulation.setTeamCount} />
        <NumberField testId="controls__courts-input" label="Courts" value={simulation.courts} min={1} max={10} onChange={simulation.setCourts} />
        <NumberField testId="controls__match-length-input" label="Match length (min)" value={simulation.matchLengthMinutes} min={1} max={120} onChange={simulation.setMatchLengthMinutes} />
        <NumberField testId="controls__tournament-length-input" label="Tournament length (min)" value={simulation.tournamentLengthMinutes} min={10} max={3000} onChange={simulation.setTournamentLengthMinutes} />
        <NumberField testId="controls__rest-input" label="Rest between matches (min)" value={simulation.effectiveRestMinutes} min={0} max={120} onChange={simulation.setRestMinutes} />
        <label className="field">
          <span>Start time</span>
          <input
            data-testid="controls__start-time-input"
            type="time"
            value={simulation.startTime}
            onChange={(event) => simulation.setStartTime(event.target.value)}
          />
        </label>
      </div>
      {simulation.validationError === null ? null : (
        <p className="error" data-testid="controls__validation-error">{simulation.validationError}</p>
      )}
    </section>
  );
}
