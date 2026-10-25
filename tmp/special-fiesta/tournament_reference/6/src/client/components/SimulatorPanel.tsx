import { useState } from 'react';
import { Activity, ArrowUpRight, Clock3, Sparkles, Users } from 'lucide-react';
import type {
  FormatDescriptor,
  ModeId,
  SimulationResult,
  TournamentSettings,
} from '../../shared/contracts.js';
import { buildMatchSections, formatClock, formatDuration, sortTimeline, summaryTone } from '../presentation.js';
import { MatchMap } from './MatchMap.js';

interface SimulatorPanelProps {
  formats: FormatDescriptor[];
  selectedMode: ModeId;
  settings: TournamentSettings;
  tournamentName: string;
  teamNames: string[];
  preview: SimulationResult | null;
  busy: boolean;
  onModeChange: (mode: ModeId) => void;
  onSettingChange: (key: keyof TournamentSettings, value: number) => void;
  onTeamCountChange: (teamCount: number) => void;
  onNameChange: (name: string) => void;
  onTeamNamesChange: (teamNames: string[]) => void;
  onPreview: () => Promise<void>;
  onCreate: () => Promise<void>;
}

export function SimulatorPanel({
  formats,
  selectedMode,
  settings,
  tournamentName,
  teamNames,
  preview,
  busy,
  onModeChange,
  onSettingChange,
  onTeamCountChange,
  onNameChange,
  onTeamNamesChange,
  onPreview,
  onCreate,
}: SimulatorPanelProps) {
  const [previewView, setPreviewView] = useState<'map' | 'timeline'>('map');
  const selectedFormat = formats.find((format) => format.id === selectedMode) ?? formats[0];
  const previewSections = preview ? buildMatchSections(selectedMode, preview.matches) : [];
  const previewTimeline = preview ? sortTimeline(preview.matches) : [];
  const fixedTeamCount = selectedFormat?.fixedTeamCount;

  function changeStartTime(value: string): void {
    onSettingChange('startTimeMinutes', parseClockInput(value));
  }

  function changeTeamList(value: string): void {
    onTeamNamesChange(value.split('\n').map((name) => name.trim()).filter(Boolean));
  }

  return (
    <div className="simulator-layout">
      <section className="setup-card" aria-labelledby="simulator-title">
        <div className="section-heading">
          <div className="section-heading__icon"><Activity size={19} /></div>
          <div>
            <p className="eyebrow">Format laboratory</p>
            <h2 id="simulator-title">Set up a tournament</h2>
          </div>
        </div>
        <p className="section-intro">Change formats to compare the full pathway, court use and estimated finish before the desk opens play.</p>
        <div className="setup-grid">
          <label className="field field--wide">
            <span>Tournament name</span>
            <input
              autoComplete="off"
              data-testid="tournament-config__name"
              maxLength={120}
              onChange={(event) => onNameChange(event.target.value)}
              value={tournamentName}
            />
          </label>
          <label className="field field--wide">
            <span>Format</span>
            <select
              data-testid="mode-picker__mode"
              onChange={(event) => onModeChange(event.target.value as ModeId)}
              value={selectedMode}
            >
              {formats.map((format) => <option key={format.id} value={format.id}>{format.name}</option>)}
            </select>
            <small>{selectedFormat?.summary}</small>
          </label>
          <label className="field">
            <span><Users size={14} /> Teams</span>
            <input
              data-testid="tournament-config__teams"
              disabled={Boolean(fixedTeamCount)}
              max={selectedFormat?.maxTeams ?? 32}
              min={selectedFormat?.minTeams ?? 2}
              onChange={(event) => onTeamCountChange(Number(event.target.value))}
              step={selectedFormat?.teamStep ?? 1}
              type="number"
              value={settings.teamCount}
            />
          </label>
          <label className="field">
            <span><MapPinIcon /> Courts</span>
            <input
              data-testid="tournament-config__courts"
              max="20"
              min="1"
              onChange={(event) => onSettingChange('courtCount', Number(event.target.value))}
              type="number"
              value={settings.courtCount}
            />
          </label>
          <label className="field">
            <span><Clock3 size={14} /> Match length</span>
            <input
              data-testid="tournament-config__match-length"
              max="120"
              min="5"
              onChange={(event) => onSettingChange('matchDurationMinutes', Number(event.target.value))}
              type="number"
              value={settings.matchDurationMinutes}
            />
            <small>minutes</small>
          </label>
          <label className="field">
            <span><Clock3 size={14} /> Day length</span>
            <input
              data-testid="tournament-config__tournament-length"
              max="720"
              min="30"
              onChange={(event) => onSettingChange('tournamentLengthMinutes', Number(event.target.value))}
              type="number"
              value={settings.tournamentLengthMinutes}
            />
            <small>minutes</small>
          </label>
          <label className="field">
            <span>Start time</span>
            <input
              data-testid="tournament-config__start-time"
              onChange={(event) => changeStartTime(event.target.value)}
              type="time"
              value={clockInput(settings.startTimeMinutes)}
            />
          </label>
          <label className="field field--wide">
            <span>Team list <em>one name per line, in seed order</em></span>
            <textarea
              data-testid="tournament-config__team-list"
              onChange={(event) => changeTeamList(event.target.value)}
              rows={Math.min(5, Math.max(3, settings.teamCount))}
              value={teamNames.join('\n')}
            />
          </label>
        </div>
        <div className="setup-actions">
          <button className="button button--quiet" data-testid="simulator__preview" disabled={busy} onClick={() => void onPreview()}>
            <Sparkles size={16} /> Preview format
          </button>
          <button className="button button--primary" data-testid="simulator__create" disabled={busy} onClick={() => void onCreate()}>
            Start tournament <ArrowUpRight size={16} />
          </button>
        </div>
      </section>
      <section className="simulation-card" aria-labelledby="preview-title">
        <div className="simulation-card__head">
          <div>
            <p className="eyebrow">Planning estimate</p>
            <h2 id="preview-title">{preview ? selectedFormat?.name : 'See how the day fits'}</h2>
          </div>
          <span className="simulation-card__stamp">No guessed results</span>
        </div>
        {!preview ? (
          <div className="preview-empty">
            <div className="preview-empty__art"><i /><i /><i /><b>→</b></div>
            <p>Future slots stay linked to the match or table that fills them. Nothing is pre-decided.</p>
            <p className="preview-empty__hint">Choose a format and preview the pathway, then switch modes to compare.</p>
          </div>
        ) : (
          <>
            <div className="estimate-stats">
              <Estimate value={preview.scheduleSummary.matchCount} label="Matches" />
              <Estimate value={`${preview.scheduleSummary.courtsAvailable}`} label="Courts" />
              <Estimate value={formatDuration(preview.scheduleSummary.durationMinutes)} label="Estimated time" />
            </div>
            <div className={`fit-banner fit-banner--${summaryTone(preview.scheduleSummary)}`}>
              <span>{preview.scheduleSummary.fits ? 'Within the day budget' : 'Longer than the day budget'}</span>
              <strong>{formatClock(preview.scheduleSummary.finishTimeMinutes)}</strong>
            </div>
            <div className="preview-switch" role="group" aria-label="Preview display">
              <button
                aria-pressed={previewView === 'map'}
                className={previewView === 'map' ? 'is-selected' : ''}
                data-testid="simulator__map-view"
                onClick={() => setPreviewView('map')}
              >Pathway map</button>
              <button
                aria-pressed={previewView === 'timeline'}
                className={previewView === 'timeline' ? 'is-selected' : ''}
                data-testid="simulator__timeline-view"
                onClick={() => setPreviewView('timeline')}
              >Court timeline</button>
            </div>
            {previewView === 'map' ? (
              <MatchMap matches={preview.matches} sections={previewSections} />
            ) : (
              <div className="timeline-list" data-testid="simulator__timeline">
                {previewTimeline.map((match) => (
                  <div className="timeline-row" key={match.id}>
                    <time>{formatClock(match.schedule.startMinute)}</time>
                    <div><strong>{match.participants[0].displayName}</strong><span> vs </span><strong>{match.participants[1].displayName}</strong><small>{match.code} · {match.phase}</small></div>
                    <span className="court-tag">Court {match.schedule.courtNumber}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Estimate({ value, label }: { value: number | string; label: string }) {
  return <div className="estimate-stat"><strong>{value}</strong><span>{label}</span></div>;
}

function clockInput(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseClockInput(value: string): number {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function MapPinIcon() {
  return <span className="field__pin" aria-hidden="true">⌖</span>;
}
