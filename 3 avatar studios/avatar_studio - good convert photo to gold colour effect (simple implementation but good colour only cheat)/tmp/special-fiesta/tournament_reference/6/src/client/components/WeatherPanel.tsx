import { useState } from 'react';
import { CloudRain, RotateCw } from 'lucide-react';
import type { TournamentRecord, WeatherChangeInput } from '../../shared/contracts.js';

interface WeatherPanelProps {
  tournament: TournamentRecord;
  weather: WeatherChangeInput;
  busy: boolean;
  disabled: boolean;
  onChange: <Key extends keyof WeatherChangeInput>(key: Key, value: WeatherChangeInput[Key]) => void;
  onApply: () => Promise<void>;
}

export function WeatherPanel({ tournament, weather, busy, disabled, onChange, onApply }: WeatherPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  function changeEffectiveTime(value: string): void {
    onChange('effectiveAtMinutes', parseTimeInput(value));
  }

  return (
    <section className={`weather-card ${isExpanded ? 'weather-card--expanded' : ''}`} aria-labelledby="weather-title">
      <div className="weather-card__top">
        <div className="weather-card__icon"><CloudRain size={19} /></div>
        <div className="weather-card__heading">
          <p className="eyebrow">If the day changes</p>
          <h3 id="weather-title">Rain plan</h3>
        </div>
        <button
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Hide rain plan settings' : 'Edit rain plan settings'}
          className="icon-button"
          data-testid="weather-panel__toggle"
          onClick={() => setIsExpanded((current) => !current)}
        >{isExpanded ? '−' : '+'}</button>
      </div>
      {!isExpanded ? (
        <p className="weather-card__summary">Change court capacity or match length; future staged games will be retimed.</p>
      ) : (
        <div className="weather-card__body">
          <p className="weather-card__summary">Matches already live or final keep their record. Unstarted matches are replanned from the change time.</p>
          <div className="weather-fields">
            <label className="field">
              <span>Courts now available</span>
              <input
                data-testid="weather-panel__courts"
                disabled={disabled}
                max="20"
                min="1"
                onChange={(event) => onChange('courtCount', Number(event.target.value))}
                type="number"
                value={weather.courtCount}
              />
            </label>
            <label className="field">
              <span>New match length</span>
              <input
                data-testid="weather-panel__duration"
                disabled={disabled}
                max="120"
                min="5"
                onChange={(event) => onChange('matchDurationMinutes', Number(event.target.value))}
                type="number"
                value={weather.matchDurationMinutes}
              />
            </label>
            <label className="field field--wide">
              <span>Change applies from</span>
              <input
                data-testid="weather-panel__effective-time"
                disabled={disabled}
                onChange={(event) => changeEffectiveTime(event.target.value)}
                type="time"
                value={timeInput(weather.effectiveAtMinutes)}
              />
            </label>
          </div>
          <button className="button button--light" data-testid="weather-panel__apply" disabled={disabled || busy} onClick={() => void onApply()}>
            <RotateCw size={15} /> Recalculate schedule
          </button>
          <p className="weather-card__footnote">Current settings: {tournament.courtCount} courts · {tournament.matchDurationMinutes} min per match</p>
        </div>
      )}
    </section>
  );
}

function timeInput(totalMinutes: number): string {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function parseTimeInput(value: string): number {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
