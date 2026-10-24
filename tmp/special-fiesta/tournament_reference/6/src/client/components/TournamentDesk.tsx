import { useState, type ReactElement } from 'react';
import { ChartNoAxesCombined, ClipboardList, GitBranch, List, LockKeyhole } from 'lucide-react';
import type {
  AwardPointsInput,
  FinalizeMatchInput,
  LiveScoreInput,
  MatchView,
  StageMatchInput,
  TournamentSnapshot,
  WeatherChangeInput,
} from '../../shared/contracts.js';
import type { MatchSection } from '../presentation.js';
import { formatClock, formatDuration } from '../presentation.js';
import { ManualMatchForm } from './ManualMatchForm.js';
import { MatchMap } from './MatchMap.js';
import { PointsPanel } from './PointsPanel.js';
import { StandingsTable } from './StandingsTable.js';
import { WeatherPanel } from './WeatherPanel.js';

type DeskTab = 'map' | 'timeline' | 'desk' | 'standings';

interface TournamentDeskProps {
  snapshot: TournamentSnapshot;
  sections: MatchSection[];
  timeline: MatchView[];
  weather: WeatherChangeInput;
  busy: boolean;
  error: string;
  onWeatherChange: <Key extends keyof WeatherChangeInput>(key: Key, value: WeatherChangeInput[Key]) => void;
  onApplyWeather: () => Promise<void>;
  onStageMatch: (input: StageMatchInput) => Promise<void>;
  onSaveScore: (matchId: string, score: LiveScoreInput) => Promise<void>;
  onFinalizeMatch: (matchId: string, result: FinalizeMatchInput) => Promise<void>;
  onAwardPoints: (input: AwardPointsInput) => Promise<void>;
  onVoidPoints: (entryId: string, reason: string) => Promise<void>;
  onClose: (reason: string) => Promise<void>;
}

export function TournamentDesk({
  snapshot,
  sections,
  timeline,
  weather,
  busy,
  error,
  onWeatherChange,
  onApplyWeather,
  onStageMatch,
  onSaveScore,
  onFinalizeMatch,
  onAwardPoints,
  onVoidPoints,
  onClose,
}: TournamentDeskProps) {
  const [activeTab, setActiveTab] = useState<DeskTab>('map');
  const [closeReason, setCloseReason] = useState('');
  const { tournament, matches, teams, scheduleSummary } = snapshot;
  const isClosed = tournament.status === 'closed';
  const tabs: Array<{ id: DeskTab; label: string; icon: ReactElement }> = [
    { id: 'map', label: 'Pathway map', icon: <GitBranch size={16} /> },
    { id: 'timeline', label: 'Court timeline', icon: <List size={16} /> },
    { id: 'desk', label: 'Score & points desk', icon: <ClipboardList size={16} /> },
    { id: 'standings', label: 'Standings', icon: <ChartNoAxesCombined size={16} /> },
  ];

  return (
    <div className="tournament-desk">
      <header className="event-heading">
        <div>
          <p className="eyebrow">Live event · {tournament.mode.replaceAll('-', ' ')}</p>
          <h2>{tournament.name}</h2>
          <p>{teams.length} teams <span>·</span> {matches.length} matches <span>·</span> starts {formatClock(tournament.startTimeMinutes)}</p>
        </div>
        <span className={`event-status event-status--${tournament.status}`}>
          <i /> {tournament.status === 'closed' ? 'Closed' : tournament.status === 'running' ? 'In play' : 'Ready'}
        </span>
      </header>
      <div className="event-stat-row">
        <EventStat label="Matches" value={scheduleSummary.matchCount} />
        <EventStat label="Projected duration" value={formatDuration(scheduleSummary.durationMinutes)} />
        <EventStat label="Projected finish" value={formatClock(scheduleSummary.finishTimeMinutes)} />
        <EventStat label="Day budget" value={formatDuration(scheduleSummary.tournamentLengthMinutes)} tone={scheduleSummary.fits ? 'good' : 'warning'} />
      </div>
      {!scheduleSummary.fits && <div className="capacity-warning" role="status">This format currently runs beyond the day budget. Adjust the format or resources before play.</div>}
      <div className="desk-layout">
        <main className="desk-main">
          <nav className="desk-tabs" aria-label="Tournament views">
            {tabs.map((tab) => (
              <button
                aria-pressed={activeTab === tab.id}
                className={activeTab === tab.id ? 'desk-tab is-active' : 'desk-tab'}
                data-testid={`tournament-desk__tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >{tab.icon}<span>{tab.label}</span></button>
            ))}
          </nav>
          {error && <p className="error-banner" role="alert" data-testid="tournament-desk__error">{error}</p>}
          {activeTab === 'map' && (
            <section className="desk-view" aria-label="Tournament match pathway">
              <div className="desk-view__heading"><div><p className="eyebrow">Every match and its sources</p><h3>Match pathway</h3></div></div>
              <MatchMap matches={matches} sections={sections} />
            </section>
          )}
          {activeTab === 'timeline' && <TimelineView matches={timeline} />}
          {activeTab === 'desk' && (
            <section className="desk-view" aria-label="Live scoring desk">
              <div className="desk-view__heading"><div><p className="eyebrow">Stage · score · finalise</p><h3>Match control</h3></div></div>
              <ManualMatchForm disabled={isClosed || busy} onStage={onStageMatch} teams={teams} />
              <MatchMap
                disabled={isClosed || busy}
                interactive
                matches={matches}
                onFinalize={onFinalizeMatch}
                onSaveScore={onSaveScore}
                sections={sections}
              />
              <PointsPanel
                busy={busy}
                disabled={isClosed}
                entries={snapshot.pointEntries}
                onAward={onAwardPoints}
                onVoid={onVoidPoints}
                teams={teams}
              />
            </section>
          )}
          {activeTab === 'standings' && (
            <section className="desk-view" aria-label="Tournament standings">
              <div className="desk-view__heading"><div><p className="eyebrow">Points · results · score difference</p><h3>Standings</h3></div></div>
              <StandingsTable groupStandings={snapshot.groupStandings} standings={snapshot.standings} />
            </section>
          )}
        </main>
        <aside className="desk-aside">
          <WeatherPanel
            busy={busy}
            disabled={isClosed}
            onApply={onApplyWeather}
            onChange={onWeatherChange}
            tournament={tournament}
            weather={weather}
          />
          <section className="close-event-card">
            <div className="close-event-card__icon"><LockKeyhole size={16} /></div>
            <div>
              <p className="eyebrow">Finish the day</p>
              <h3>{isClosed ? 'Event closed' : 'Close tournament'}</h3>
            </div>
            {isClosed ? (
              <p className="close-event-card__reason">{tournament.closingReason}</p>
            ) : (
              <>
                <label className="field">
                  <span>Reason, if matches remain</span>
                  <input data-testid="tournament-desk__close-reason" maxLength={500} onChange={(event) => setCloseReason(event.target.value)} value={closeReason} />
                </label>
                <button className="button button--dark button--full" data-testid="tournament-desk__close" disabled={busy} onClick={() => void onClose(closeReason)}>
                  Close event
                </button>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function EventStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'good' | 'warning';
}) {
  return (
    <div className={`event-stat ${tone ? `event-stat--${tone}` : ''}`}>
      <span>{label}</span><strong>{value}</strong>
    </div>
  );
}

function TimelineView({ matches }: { matches: MatchView[] }) {
  const isEmpty = matches.length === 0;
  return (
    <section className="desk-view" aria-label="Court timeline">
      <div className="desk-view__heading"><div><p className="eyebrow">By start time and court</p><h3>Running order</h3></div></div>
      {isEmpty ? <p className="empty-inline">No matches have been planned yet.</p> : (
        <div className="table-scroll">
          <table className="timeline-table" data-testid="tournament-desk__timeline">
            <thead><tr><th>Time</th><th>Match</th><th>Phase</th><th>Court</th><th>Status</th></tr></thead>
            <tbody>{matches.map((match) => <TimelineRow key={match.id} match={match} />)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TimelineRow({ match }: { match: MatchView }) {
  return (
    <tr>
      <td><strong>{formatClock(match.schedule.startMinute)}</strong><small>to {formatClock(match.schedule.endMinute)}</small></td>
      <td><a data-testid="timeline-row__match-link" href={`#match-${match.id}`}>{match.participants[0].displayName} vs {match.participants[1].displayName}</a><small>{match.code}</small></td>
      <td>{match.phase}</td>
      <td><span className="court-tag">Court {match.schedule.courtNumber}</span></td>
      <td><span className={`status-pill status-pill--${match.status}`}>{match.status}</span></td>
    </tr>
  );
}
