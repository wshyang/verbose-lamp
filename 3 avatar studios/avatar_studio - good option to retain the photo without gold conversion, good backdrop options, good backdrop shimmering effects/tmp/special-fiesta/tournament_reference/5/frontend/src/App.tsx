import { useState } from 'react';
import { formatMinutes } from '../../shared/time.js';
import { useSimulation } from './lib/hooks/useSimulation.js';
import { useDesk } from './lib/hooks/useDesk.js';
import ControlsPanel from './components/ControlsPanel.js';
import BracketView from './components/BracketView.js';
import TimelineTable from './components/TimelineTable.js';
import DeskPanel from './components/DeskPanel.js';

type ViewTab = 'bracket' | 'timeline';

export default function App() {
  const simulation = useSimulation();
  const desk = useDesk();
  const [tab, setTab] = useState<ViewTab>('bracket');
  const result = simulation.result;
  const fitMessage = result === null
    ? 'Choose a valid field size to see the schedule.'
    : result.fitsInTournamentLength
      ? `This is ${result.playableMatches} matches, ${result.totalMinutes} minutes of play — it fits the ${simulation.tournamentLengthMinutes} minute day.`
      : `This is ${result.playableMatches} matches, ${result.totalMinutes} minutes of play — it overruns the ${simulation.tournamentLengthMinutes} minute day by ${result.overrunMinutes} minutes. Shorten matches, add courts, or accept a later finish.`;
  const liveContext = desk.graph === null
    ? undefined
    : { teams: desk.graph.teams, matches: desk.graph.matches };

  return (
    <main className="app">
      <header>
        <h1>Tournament Engine</h1>
        <p>
          Simulate any format with placeholder slots — Winner of M3, #1 Group A — then open it
          as a live day and run it from the desk. No result is ever predicted.
        </p>
      </header>

      <ControlsPanel simulation={simulation} />

      <section className="panel" aria-label="Simulation">
        <div className="summary-grid">
          <div className="summary-card">
            <span>Matches</span>
            <strong data-testid="summary__match-count">{result === null ? '—' : result.playableMatches}</strong>
          </div>
          <div className="summary-card">
            <span>Court time needed</span>
            <strong data-testid="summary__court-minutes">{result === null ? '—' : `${result.courtMinutes} min`}</strong>
          </div>
          <div className="summary-card">
            <span>Estimated finish</span>
            <strong data-testid="summary__finish">{result === null ? '—' : formatMinutes(result.finishMinutes)}</strong>
          </div>
          <div className="summary-card">
            <span>Wet weather</span>
            <strong>Change courts or match length — remaining matches re-time instantly.</strong>
          </div>
        </div>
        <p data-testid="summary__fit-message">{fitMessage}</p>
        <div className="tabs" role="tablist" aria-label="Simulation views">
          <button
            type="button" role="tab" aria-selected={tab === 'bracket'}
            data-testid="app__bracket-tab" onClick={() => setTab('bracket')}
          >
            Bracket &amp; links
          </button>
          <button
            type="button" role="tab" aria-selected={tab === 'timeline'}
            data-testid="app__timeline-tab" onClick={() => setTab('timeline')}
          >
            Timeline
          </button>
        </div>
        {result === null ? (
          <p data-testid="app__no-simulation">No schedule for this field size.</p>
        ) : tab === 'bracket' ? (
          <BracketView matches={result.matches} />
        ) : (
          <TimelineTable matches={result.matches} />
        )}
      </section>

      {desk.graph === null ? null : (
        <section className="panel" aria-label="Live tournament bracket">
          <h2>Live bracket — {desk.graph.tournament.name}</h2>
          <BracketView matches={desk.graph.matches} context={liveContext} />
        </section>
      )}

      <DeskPanel desk={desk} simulation={simulation} />
    </main>
  );
}
