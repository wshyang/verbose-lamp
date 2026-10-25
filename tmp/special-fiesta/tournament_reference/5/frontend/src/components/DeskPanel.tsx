import { useState } from 'react';
import type { DeskState } from '../lib/hooks/useDesk.js';
import type { SimulationState } from '../lib/hooks/useSimulation.js';
import MatchDeskTable from './MatchDeskTable.js';
import PointsLedger from './PointsLedger.js';
import StandingsTable from './StandingsTable.js';

interface Props { desk: DeskState; simulation: SimulationState }

export default function DeskPanel({ desk, simulation }: Props) {
  const [tournamentName, setTournamentName] = useState('Tournament Day');
  const [manualA, setManualA] = useState('');
  const [manualB, setManualB] = useState('');
  const [manualCourt, setManualCourt] = useState('');
  const [pointsTeam, setPointsTeam] = useState('');
  const [pointsValue, setPointsValue] = useState('3');
  const [pointsReason, setPointsReason] = useState('Desk award');
  const [rainCourts, setRainCourts] = useState('1');
  const [rainLength, setRainLength] = useState('10');

  const createFromSimulation = () => {
    void desk.createTournament({
      name: tournamentName,
      mode: simulation.mode,
      teamNames: Array.from({ length: simulation.teamCount }, (_, index) => `Team ${index + 1}`),
      config: simulation.config,
    });
  };
  const graph = desk.graph;
  const teamOptions = graph === null ? [] : graph.teams.map((team) => (
    <option key={team.id} value={team.id}>{team.name}</option>
  ));
  const courtOptions = graph === null ? [] : graph.courts.map((court) => (
    <option key={court.id} value={court.id}>{court.name}</option>
  ));
  const tournamentOptions = desk.tournaments.map((tournament) => (
    <option key={tournament.id} value={tournament.id}>{tournament.name} ({tournament.mode})</option>
  ));
  const stageManual = () => {
    void desk.stageManualMatch({
      teamAId: manualA, teamBId: manualB,
      courtId: manualCourt === '' ? undefined : manualCourt,
    });
  };

  return (
    <section className="panel desk" aria-label="Live desk">
      <h2>Live desk</h2>
      <div className="field-grid">
        <label className="field">
          <span>Tournament name</span>
          <input
            data-testid="desk__name-input" type="text" value={tournamentName}
            onChange={(event) => setTournamentName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Saved tournaments</span>
          <select
            data-testid="desk__tournament-select" defaultValue=""
            onChange={(event) => void desk.selectTournament(event.target.value)}
          >
            <option value="" disabled>Open a saved tournament…</option>
            {tournamentOptions}
          </select>
        </label>
      </div>
      <button type="button" data-testid="desk__create-button" onClick={createFromSimulation}>
        Open current simulation as a live tournament
      </button>
      {desk.error === null ? null : <p className="error" data-testid="desk__error">{desk.error}</p>}
      {desk.isLoading ? <p data-testid="desk__loading">Working…</p> : null}
      {graph === null ? (
        <p data-testid="desk__no-tournament">No live tournament open. Create one from the simulation above.</p>
      ) : (
        <div>
          <h3>
            {graph.tournament.name} — {graph.tournament.mode} ({graph.tournament.status})
          </h3>
          <MatchDeskTable graph={graph} actions={desk} />
          <h3>Stage a match by hand</h3>
          <div className="field-grid">
            <label className="field"><span>Team A</span>
              <select data-testid="desk__manual-a-select" value={manualA} onChange={(event) => setManualA(event.target.value)}>
                <option value="" disabled>Choose team A</option>{teamOptions}
              </select>
            </label>
            <label className="field"><span>Team B</span>
              <select data-testid="desk__manual-b-select" value={manualB} onChange={(event) => setManualB(event.target.value)}>
                <option value="" disabled>Choose team B</option>{teamOptions}
              </select>
            </label>
            <label className="field"><span>Court (optional)</span>
              <select data-testid="desk__manual-court-select" value={manualCourt} onChange={(event) => setManualCourt(event.target.value)}>
                <option value="">No court yet</option>{courtOptions}
              </select>
            </label>
          </div>
          <button type="button" data-testid="desk__stage-manual-button" onClick={stageManual}>Stage match</button>
          <h3>Assign points directly</h3>
          <div className="field-grid">
            <label className="field"><span>Team</span>
              <select data-testid="desk__points-team-select" value={pointsTeam} onChange={(event) => setPointsTeam(event.target.value)}>
                <option value="" disabled>Choose team</option>{teamOptions}
              </select>
            </label>
            <label className="field"><span>Points</span>
              <input data-testid="desk__points-value-input" type="number" value={pointsValue} onChange={(event) => setPointsValue(event.target.value)} />
            </label>
            <label className="field"><span>Reason</span>
              <input data-testid="desk__points-reason-input" type="text" value={pointsReason} onChange={(event) => setPointsReason(event.target.value)} />
            </label>
          </div>
          <button
            type="button" data-testid="desk__assign-points-button"
            onClick={() => void desk.assignPoints(pointsTeam, Number(pointsValue), pointsReason)}
          >
            Assign points
          </button>
          <PointsLedger graph={graph} onVoid={desk.voidPoints} />
          <h3>Wet-weather contingency</h3>
          <p>Cut courts or shorten matches: every match that has not started is re-timed. Live and finished matches stay as played.</p>
          <div className="field-grid">
            <label className="field"><span>Courts now available</span>
              <input data-testid="desk__rain-courts-input" type="number" min={1} value={rainCourts} onChange={(event) => setRainCourts(event.target.value)} />
            </label>
            <label className="field"><span>New match length (min)</span>
              <input data-testid="desk__rain-length-input" type="number" min={1} value={rainLength} onChange={(event) => setRainLength(event.target.value)} />
            </label>
          </div>
          <button
            type="button" data-testid="desk__contingency-button"
            onClick={() => void desk.applyContingency(Number(rainCourts), Number(rainLength))}
          >
            Apply contingency and re-time remaining matches
          </button>
          <h3>Standings</h3>
          <StandingsTable standings={graph.standings} />
          <button type="button" data-testid="desk__close-button" onClick={() => void desk.closeTournament()}>
            Close the day
          </button>
        </div>
      )}
    </section>
  );
}
