import type { SimulatedMatch, SimulationResult } from '@psd/tournament/scheduler';
import type { FieldHelpTopic } from '@psd/contracts';
import { CheckField, ConsoleField } from '../../components/console/ConsoleField.js';
import { clockOf, useTournamentSimulator, type SimulatorKnobs } from '../../lib/hooks/useTournamentSimulator.js';
import { AdminShell } from '../AdminShell.js';
import { stageFlowsOf } from '../../lib/hooks/stageFlowText.js';
import { StagePipelineEditor } from './StagePipelineEditor.js';
import { TournamentTabs } from './TournamentTabs.js';

/**
 * ADR-279 — the Simulator subtab: rehearse a day before it exists. The engine's own `simulate()` runs
 * here in the browser on every change, starting from the teams registered and the courts switched on,
 * so what it shows is what Start would build and the scheduler would plan.
 */

type Simulator = ReturnType<typeof useTournamentSimulator>;

type TextKnob =
  | 'teamCount'
  | 'courtCount'
  | 'groupSize'
  | 'advanceCount'
  | 'rounds'
  | 'matchMinutes'
  | 'changeoverMinutes'
  | 'restMinutes'
  | 'startAt'
  | 'deadline';

function Knob(props: { simulator: Simulator; name: TextKnob; label: string; topic: FieldHelpTopic; isTime?: boolean }) {
  const { simulator, name } = props;
  return (
    <ConsoleField id={`simulator-${name}`} label={props.label} topic={props.topic}>
      <input
        className="console-input"
        type={props.isTime === true ? 'time' : 'text'}
        value={simulator.knobs[name]}
        data-testid={`simulator__${name}`}
        onChange={(event) => simulator.update({ [name]: event.target.value })}
      />
    </ConsoleField>
  );
}

export function roomLine(simulator: Pick<Simulator, 'registeredTeams' | 'enabledCourts'>): string {
  if (simulator.registeredTeams === null) return '';
  return `${simulator.registeredTeams} teams registered, ${simulator.enabledCourts ?? 0} courts on`;
}

function Knobs(props: { simulator: Simulator }) {
  const { simulator } = props;
  const { knobs } = simulator;
  return (
    <section className="console-panel" data-testid="simulator__knobs">
      <h2>The day to rehearse</h2>
      <p className="console-meta" data-testid="simulator__room">
        {roomLine(simulator)}
      </p>
      <ConsoleField id="simulator-build" label="Build" topic="simulatorBuild">
        <select
          className="console-select"
          value={knobs.buildMode}
          data-testid="simulator__build"
          onChange={(event) => simulator.update({ buildMode: event.target.value as SimulatorKnobs['buildMode'] })}
        >
          <option value="format">One format for the whole tournament</option>
          <option value="pipeline">Stage by stage — each with its own format and minutes</option>
        </select>
      </ConsoleField>
      {knobs.buildMode === 'pipeline' ? (
        <StagePipelineEditor
          testPrefix="simulator"
          stages={knobs.stages}
          flows={stageFlowsOf(knobs.stages, Number.isInteger(Number(knobs.teamCount)) ? Number(knobs.teamCount) : 0)}
          onChange={simulator.updateStage}
          onAdd={simulator.addStage}
          onRemove={simulator.removeStage}
          onMove={simulator.moveStage}
          onResetTemplate={simulator.resetStages}
        />
      ) : (
        <>
          <ConsoleField id="simulator-format" label="Format" topic="simulatorFormat">
            <select
              className="console-select"
              value={knobs.formatId}
              data-testid="simulator__format"
              onChange={(event) => simulator.update({ formatId: event.target.value as SimulatorKnobs['formatId'] })}
            >
              {simulator.formats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label}
                </option>
              ))}
            </select>
          </ConsoleField>
          <div className="console-row">
            <Knob simulator={simulator} name="groupSize" label="Group size" topic="simulatorGroupSize" />
            <Knob simulator={simulator} name="advanceCount" label="Go through" topic="simulatorAdvance" />
            <Knob simulator={simulator} name="rounds" label="Swiss rounds" topic="simulatorRounds" />
          </div>
        </>
      )}
      <div className="console-row">
        <Knob simulator={simulator} name="teamCount" label="Teams" topic="simulatorTeams" />
        <Knob simulator={simulator} name="courtCount" label="Courts" topic="simulatorCourts" />
      </div>
      <div className="console-row">
        <Knob simulator={simulator} name="matchMinutes" label="Match min" topic="simulatorMatchMinutes" />
        <Knob simulator={simulator} name="changeoverMinutes" label="Changeover min" topic="simulatorChangeover" />
        <Knob simulator={simulator} name="restMinutes" label="Rest min" topic="simulatorRest" />
        <Knob simulator={simulator} name="startAt" label="First match" topic="simulatorFirstMatch" isTime />
        <Knob simulator={simulator} name="deadline" label="Hard stop" topic="simulatorDeadline" isTime />
      </div>
      {knobs.buildMode === 'pipeline' ? null : (
      <CheckField id="simulator-third-place" label="Third-place match" topic="simulatorThirdPlace">
        <input
          type="checkbox"
          checked={knobs.hasThirdPlace}
          data-testid="simulator__third-place"
          onChange={(event) => simulator.update({ hasThirdPlace: event.target.checked })}
        />
      </CheckField>
      )}
    </section>
  );
}

export function fitSummary(result: SimulationResult): string {
  if (result.fit === null) return '';
  const finish = clockOf(result.fit.projectedFinish);
  const fits = result.fit.fitsDeadline;
  const deadline = fits === null ? '' : fits ? ' — fits the hard stop' : ` — ${result.fit.overrunMinutes} min past the hard stop`;
  return `${result.matches.length} matches, last one ends ${finish}${deadline}.`;
}

export function courtOf(match: SimulatedMatch): string {
  return match.courtIndex === null ? '—' : `Court ${match.courtIndex + 1}`;
}

export function stageOf(match: SimulatedMatch): string {
  return match.groupCode === null ? match.stageCode : `${match.stageCode} ${match.groupCode}`;
}

function PlanRow(props: { match: SimulatedMatch }) {
  const { match } = props;
  const backToBack = match.isBackToBack ? ' (back-to-back)' : '';
  return (
    <tr data-testid="simulator__row" data-back-to-back={match.isBackToBack ? 'true' : 'false'}>
      <td>{match.code}</td>
      <td>{stageOf(match)}</td>
      <td>
        {match.aLabel} v {match.bLabel}
        {backToBack}
      </td>
      <td>{courtOf(match)}</td>
      <td>{clockOf(match.start)}</td>
      <td>{clockOf(match.end)}</td>
    </tr>
  );
}

function Plan(props: { result: SimulationResult }) {
  const { result } = props;
  if (result.error !== null) {
    return (
      <p className="console-warning" role="status" data-testid="simulator__error">
        {result.error}
      </p>
    );
  }
  const isOverrun = result.fit?.fitsDeadline === false;
  return (
    <section className="console-panel" data-testid="simulator__plan">
      <p className={isOverrun ? 'console-warning' : 'console-meta'} data-testid="simulator__fit">
        {fitSummary(result)}
      </p>
      <table className="console-table">
        <thead>
          <tr>
            <th>Match</th>
            <th>Stage</th>
            <th>Teams</th>
            <th>Court</th>
            <th>Start</th>
            <th>End</th>
          </tr>
        </thead>
        <tbody>
          {result.matches.map((match) => (
            <PlanRow key={match.code} match={match} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function TournamentSimulatorPage() {
  const simulator = useTournamentSimulator();
  return (
    <AdminShell title="Tournament">
      <TournamentTabs />
      <Knobs simulator={simulator} />
      <Plan result={simulator.result} />
    </AdminShell>
  );
}
