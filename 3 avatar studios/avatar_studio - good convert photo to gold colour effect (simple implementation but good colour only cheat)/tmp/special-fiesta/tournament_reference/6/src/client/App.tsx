import { CalendarDays, CircleHelp, Signal, Trophy } from 'lucide-react';
import { useTournamentDesk } from './hooks/useTournamentDesk.js';
import { SimulatorPanel } from './components/SimulatorPanel.js';
import { TournamentDesk } from './components/TournamentDesk.js';

export function App() {
  const desk = useTournamentDesk();
  const activeEventName = desk.tournament?.tournament.name ?? 'No event open';
  const showDesk = desk.activeView === 'tournament' && desk.tournament !== null;
  const pageContent = showDesk ? (
    <TournamentDesk
      busy={desk.busy}
      error={desk.error}
      onApplyWeather={desk.applyWeatherChange}
      onAwardPoints={desk.awardPoints}
      onClose={desk.closeTournament}
      onFinalizeMatch={desk.finalizeMatch}
      onSaveScore={desk.saveLiveScore}
      onStageMatch={desk.stageMatch}
      onVoidPoints={desk.voidPointAward}
      onWeatherChange={desk.updateWeather}
      sections={desk.matchSections}
      snapshot={desk.tournament!}
      timeline={desk.timeline}
      weather={desk.weather}
    />
  ) : (
    <>
      {desk.error && <p className="error-banner app-error" role="alert" data-testid="app__error">{desk.error}</p>}
      <SimulatorPanel
        busy={desk.busy}
        formats={desk.formats}
        onCreate={desk.createTournament}
        onModeChange={desk.changeMode}
        onNameChange={desk.setTournamentName}
        onPreview={desk.previewFormat}
        onSettingChange={desk.updateSetting}
        onTeamCountChange={desk.updateTeamCount}
        onTeamNamesChange={desk.setTeamNames}
        preview={desk.preview}
        selectedMode={desk.selectedMode}
        settings={desk.settings}
        teamNames={desk.teamNames}
        tournamentName={desk.tournamentName}
      />
    </>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Matchday home">
          <span className="brand__mark"><Trophy size={17} /></span>
          <span>matchday<span className="brand__dot">.</span></span>
        </a>
        <div className="topbar__right">
          <div className="connection-state"><Signal size={14} /><span>Desk connected</span></div>
          {desk.recentTournaments.length > 0 && (
            <label className="recent-picker">
              <span>Recent</span>
              <select
                aria-label="Open a recent tournament"
                data-testid="tournament-selector__recent"
                onChange={(event) => { if (event.target.value) void desk.openTournament(event.target.value); }}
                value={desk.tournament?.tournament.id ?? ''}
              >
                <option value="">Choose an event</option>
                {desk.recentTournaments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          <a className="help-button" data-testid="app__help" href="#guide" title="About the tournament desk">
            <CircleHelp size={18} /> <span>Guide</span>
          </a>
        </div>
      </header>
      <main id="top" className="page-shell">
        <section className="page-intro">
          <div>
            <p className="eyebrow"><CalendarDays size={14} /> One clear record for tournament day</p>
            <h1>Run the day.<br /><span>Know what happens next.</span></h1>
            <p className="page-intro__copy">Plan a format, make the schedule fit the resources, and keep scores and team points together at the desk.</p>
          </div>
          <div className="active-event-chip">
            <span className="active-event-chip__signal" />
            <div><small>Current event</small><strong>{activeEventName}</strong></div>
          </div>
        </section>
        {desk.tournament && (
          <nav className="main-tabs" aria-label="Main views">
            <button
              aria-pressed={desk.activeView === 'simulator'}
              className={desk.activeView === 'simulator' ? 'main-tab is-active' : 'main-tab'}
              data-testid="app__simulator-tab"
              onClick={() => desk.setActiveView('simulator')}
            >Format simulator</button>
            <button
              aria-pressed={desk.activeView === 'tournament'}
              className={desk.activeView === 'tournament' ? 'main-tab is-active' : 'main-tab'}
              data-testid="app__tournament-tab"
              onClick={() => desk.setActiveView('tournament')}
            >Tournament desk</button>
          </nav>
        )}
        {desk.loading ? (
          <div className="loading-state" data-testid="app__loading"><span className="loading-spinner" /> Connecting to the tournament desk…</div>
        ) : pageContent}
        <footer id="guide" className="app-footer">
          <span>Built for the room, not the spreadsheet.</span>
          <span>Scores · schedule · points · one record</span>
        </footer>
      </main>
    </div>
  );
}
