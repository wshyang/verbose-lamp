import type { AdminCourtView, AdminEntrantView, AdminGroupView, AdminStageView, AdminStandingView, AdminTournamentView, ContingencyPreviewView, FitView } from '@psd/contracts';
import { ConsoleField } from '../../components/console/ConsoleField.js';
import { FieldHelp } from '../../components/console/FieldHelp.js';
import type { Contingency } from '../../lib/hooks/useContingency.js';
import { useFieldHelp } from '../../lib/hooks/useFieldHelp.js';
import type { DeskAct } from '../../lib/hooks/useTournamentActs.js';
import { timeOf } from './MatchesPanel.js';

/**
 * ADR-279 — the day around the matches: the scheduler and how the day fits (requirement 9's off
 * switch), the stages and their tables (requirement 5), the teams and their awards (requirement 6),
 * and the courts with contingency previewed before it is applied (requirement 8).
 */

export function fitLine(fit: FitView | null): string {
  if (fit === null) return 'No plan: the scheduler is stopped. Every scheduling act is the desk’s.';
  const finish = fit.projectedFinishAt === null ? 'nothing left to place' : `projected finish ${timeOf(fit.projectedFinishAt)}`;
  const deadline = fit.fitsDeadline === null ? '' : fit.fitsDeadline ? ' — fits the hard stop' : ` — ${fit.overrunMinutes} min past the hard stop`;
  return `${fit.remainingMatches} matches to place, ${finish}${deadline}.`;
}

/** A stage's table rows: its groups' tables one after another, or the stage's own when it has none. */
export function stageRows(stage: AdminStageView): (AdminStandingView & { group: string })[] {
  if (stage.groups.length === 0) return stage.standings.map((row) => ({ ...row, group: '' }));
  return stage.groups.flatMap((group) => group.standings.map((row) => ({ ...row, group: group.code })));
}

/**
 * ADR-325 — a group dealt as seats has no table until the stage feeding it closes. Rather than a
 * stage that silently shows nothing for it, the desk is told which stage decides it. A group that
 * already has a table, or a stage with no feeder, has nothing to wait for.
 */
export function waitingGroupLine(stage: AdminStageView, group: AdminGroupView): string | null {
  if (stage.intake === null || group.standings.length > 0) return null;
  return `${group.label}: decided when ${stage.intake.fromLabel} closes.`;
}

/** What a contingency would move: every change but a first placement, each as one line. */
export function changeLines(preview: ContingencyPreviewView): { matchId: string; line: string }[] {
  const at = (where: { courtLabel: string; startAt: string } | null) => (where === null ? 'unplaced' : `${where.courtLabel} ${timeOf(where.startAt)}`);
  return preview.changes.filter((change) => change.kind !== 'added').map((change) => ({ matchId: change.matchId, line: `${change.code}: ${at(change.from)} → ${at(change.to)}` }));
}

/**
 * ADR-320 — the reconciled handover in one line: the stage's internal table points
 * (ranking only, never paid) and who the next stage takes, qualifiers then fills.
 */
export function advancerLine(stage: AdminStageView): string {
  const points = `Table points ${stage.tablePoints.win}/${stage.tablePoints.draw}/${stage.tablePoints.loss} (ranking only)`;
  if (stage.advancers.length === 0) return `${points}.`;
  const who = stage.advancers.map((row) => `#${row.place} ${row.name}${row.via === 'fill' ? ' (fill)' : ''}`).join(' · ');
  return `${points}. Through: ${who}.`;
}

export function entrantLine(entrant: AdminEntrantView): string {
  return `#${entrant.entryOrder} ${entrant.name} — ${entrant.awardedPoints} pts${entrant.withdrawnAt === null ? '' : ' (withdrawn)'}`;
}

export function SchedulerPanel(props: { tournament: AdminTournamentView; onAct: (act: DeskAct) => void }) {
  const { scheduler, fit } = props.tournament;
  const isRunning = scheduler?.status === 'active';
  // ADR-311 — a composed tournament reads as what it is, not as its storage word.
  const heading = scheduler === null ? 'none' : `${scheduler.format === 'pipeline' ? 'Stage pipeline' : scheduler.format}, ${scheduler.status}`;
  const isOverrun = fit !== null && fit.fitsDeadline === false;
  return (
    <section className="console-panel" data-testid="tournament-scheduler">
      <h2>Scheduler — {heading}</h2>
      <p className={isOverrun ? 'console-warning' : 'console-meta'} data-testid="tournament-scheduler__fit">
        {fitLine(fit)}
      </p>
      {scheduler?.terminateReason ? (
        <p className="console-meta">
          Stopped by {scheduler.terminatedByLabel}: {scheduler.terminateReason}
        </p>
      ) : null}
      <div className="console-row">
        {isRunning ? (
          <button type="button" className="console-button console-button--danger" data-testid="tournament-scheduler__terminate" onClick={() => props.onAct({ kind: 'terminate' })}>
            Stop the scheduler for good
          </button>
        ) : null}
        <button type="button" className="console-button console-button--danger" data-testid="tournament-scheduler__close" onClick={() => props.onAct({ kind: 'close' })}>
          Close the tournament
        </button>
      </div>
    </section>
  );
}

function StageTable(props: { rows: (AdminStandingView & { group: string })[] }) {
  return (
    <table className="console-table" data-testid="tournament-stages__table">
      <thead>
        <tr>
          <th>Group</th>
          <th>#</th>
          <th>Team</th>
          <th>P</th>
          <th>W-D-L</th>
          <th>+/-</th>
          <th>Pts</th>
          <th>Why here</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={`${row.group}-${row.name}`}>
            <td>{row.group}</td>
            <td>{row.rank}</td>
            <td>{row.name}</td>
            <td>{row.played}</td>
            <td>
              {row.wins}-{row.draws}-{row.losses}
            </td>
            <td>{row.difference}</td>
            <td>{row.points}</td>
            <td className="console-meta">{row.explanation}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StageBlock(props: { stage: AdminStageView; canRestage: boolean; onAct: (act: DeskAct) => void }) {
  const { stage } = props;
  // ADR-329 F7 — an open stage closes like any other once its matches are done; the engine
  // refuses while one is still live, and the place form of the close covers its seats.
  const isClosable = stage.status === 'active';
  // ADR-334 — a stage can be rebuilt only before anything in it has started and before it is fed.
  const isRestageable = props.canRestage && !stage.hasStarted && stage.rosterCount === 0;
  const rows = stageRows(stage);
  const waiting = stage.groups.flatMap((group) => waitingGroupLine(stage, group) ?? []);
  return (
    <div data-testid="tournament-stages__stage">
      <div className="console-row console-row--between">
        <strong>
          {stage.label} — {stage.status}
        </strong>
        {isClosable ? (
          <button type="button" className="console-button" data-testid="tournament-stages__complete" onClick={() => props.onAct({ kind: 'completeStage', stageId: stage.id, label: stage.label, stage })}>
            Close this stage
          </button>
        ) : null}
        {isRestageable ? (
          <button type="button" className="console-button" data-testid="tournament-stages__restage" onClick={() => props.onAct({ kind: 'restage', stageId: stage.id, label: stage.label, stage })}>
            Rebuild this stage
          </button>
        ) : null}
      </div>
      <p className="console-meta" data-testid="tournament-stages__advancers">
        {advancerLine(stage)}
      </p>
      {waiting.map((line) => (
        <p key={line} className="console-meta" data-testid="tournament-stages__waiting">
          {line}
        </p>
      ))}
      <StageTable rows={rows} />
    </div>
  );
}

export function StagesPanel(props: { stages: readonly AdminStageView[]; canRestage?: boolean; onAct: (act: DeskAct) => void }) {
  return (
    <section className="console-panel" data-testid="tournament-stages">
      <h2>Stages</h2>
      {props.stages.map((stage) => (
        <StageBlock key={stage.id} stage={stage} canRestage={props.canRestage ?? false} onAct={props.onAct} />
      ))}
    </section>
  );
}

function EntrantRow(props: { entrant: AdminEntrantView; onAct: (act: DeskAct) => void }) {
  const { entrant, onAct } = props;
  const isIn = entrant.withdrawnAt === null;
  return (
    <li className="console-row console-row--between" data-testid="tournament-entrants__row">
      <span>{entrantLine(entrant)}</span>
      <span className="console-row">
        <button type="button" className="console-button" data-testid="tournament-entrants__award" onClick={() => onAct({ kind: 'award', teamId: entrant.teamId, name: entrant.name })}>
          Award points
        </button>
        {isIn ? (
          <button type="button" className="console-button console-button--danger" data-testid="tournament-entrants__withdraw" onClick={() => onAct({ kind: 'withdraw', teamId: entrant.teamId, name: entrant.name })}>
            Withdraw
          </button>
        ) : null}
      </span>
    </li>
  );
}

export function EntrantsPanel(props: { entrants: readonly AdminEntrantView[]; onAct: (act: DeskAct) => void }) {
  return (
    <section className="console-panel" data-testid="tournament-entrants">
      <h2>Teams</h2>
      <ul className="console-list">
        {props.entrants.map((entrant) => (
          <EntrantRow key={entrant.teamId} entrant={entrant} onAct={props.onAct} />
        ))}
      </ul>
    </section>
  );
}

function PreviewList(props: { preview: ContingencyPreviewView }) {
  const lines = changeLines(props.preview);
  return (
    <div data-testid="tournament-contingency__preview">
      <p className="console-meta">{fitLine(props.preview.fit)}</p>
      {lines.length === 0 ? <p className="console-muted">Nothing already planned would move.</p> : null}
      <ul className="console-list">
        {lines.map((change) => (
          <li key={change.matchId}>{change.line}</li>
        ))}
      </ul>
    </div>
  );
}

function TimingInputs(props: { contingency: Contingency }) {
  const { contingency } = props;
  return (
    <div className="console-row">
      <ConsoleField id="contingency-minutes" label="Match minutes" topic="contingencyMinutes">
        <input
          className="console-input"
          inputMode="numeric"
          value={contingency.draft.matchMinutes}
          data-testid="tournament-contingency__minutes"
          onChange={(event) => contingency.update({ matchMinutes: event.target.value })}
        />
      </ConsoleField>
      <ConsoleField id="contingency-changeover" label="Changeover minutes" topic="contingencyChangeover">
        <input
          className="console-input"
          inputMode="numeric"
          value={contingency.draft.changeoverMinutes}
          data-testid="tournament-contingency__changeover"
          onChange={(event) => contingency.update({ changeoverMinutes: event.target.value })}
        />
      </ConsoleField>
      <ConsoleField id="contingency-rest" label="Rest minutes" topic="contingencyRest">
        <input
          className="console-input"
          inputMode="numeric"
          value={contingency.draft.restMinutes}
          data-testid="tournament-contingency__rest"
          onChange={(event) => contingency.update({ restMinutes: event.target.value })}
        />
      </ConsoleField>
      <ConsoleField id="contingency-deadline" label="Hard stop (ISO, or none)" topic="contingencyDeadline">
        <input
          className="console-input"
          value={contingency.draft.deadlineAt}
          data-testid="tournament-contingency__deadline"
          onChange={(event) => contingency.update({ deadlineAt: event.target.value })}
        />
      </ConsoleField>
    </div>
  );
}

/** ADR-329 F13 — a length per stage with matches still to play; started matches keep theirs. */
function StageTimingInputs(props: { contingency: Contingency; stageTimings: readonly { id: string; label: string }[] }) {
  const { contingency } = props;
  if (props.stageTimings.length === 0) return null;
  return (
    <div className="console-row">
      {props.stageTimings.map((stage) => (
        <ConsoleField key={stage.id} id={`contingency-stage-${stage.id}`} label={`${stage.label} minutes`} topic="contingencyStageMinutes">
          <input
            className="console-input"
            inputMode="numeric"
            value={contingency.draft.stageMinutes[stage.id] ?? ''}
            data-testid="tournament-contingency__stage-minutes"
            onChange={(event) =>
              contingency.update({ stageMinutes: { ...contingency.draft.stageMinutes, [stage.id]: event.target.value } })
            }
          />
        </ConsoleField>
      ))}
    </div>
  );
}

export function ContingencyPanel(props: {
  contingency: Contingency;
  courts: readonly AdminCourtView[];
  stageTimings: readonly { id: string; label: string; matchMinutes: number }[];
  isPending: boolean;
}) {
  const { contingency } = props;
  const courtsHelp = useFieldHelp();
  const canApply = !props.isPending && contingency.preview !== null;
  return (
    <section className="console-panel" data-testid="tournament-contingency">
      <h2>Courts and timings</h2>
      <div className="console-row">
        <span className="console-label">Courts in play</span>
        <FieldHelp label="Courts in play" topic="contingencyCourts" help={courtsHelp} />
        {props.courts.map((court) => (
          <label key={court.id} className="console-row">
            <input
              type="checkbox"
              aria-describedby={courtsHelp.tooltipId}
              checked={contingency.draft.enabledCourtIds.includes(court.id)}
              data-testid="tournament-contingency__court"
              onChange={() => contingency.toggleCourt(court.id)}
            />
            {court.label}
          </label>
        ))}
      </div>
      <TimingInputs contingency={contingency} />
      <StageTimingInputs contingency={contingency} stageTimings={props.stageTimings} />
      <div className="console-row">
        <button type="button" className="console-button" data-testid="tournament-contingency__preview-button" onClick={() => void contingency.runPreview()}>
          Preview
        </button>
        <button type="button" className="console-button console-button--primary" disabled={!canApply} data-testid="tournament-contingency__apply" onClick={() => void contingency.apply()}>
          Apply
        </button>
      </div>
      {contingency.previewError === null ? null : (
        <p className="console-danger" role="alert">
          {contingency.previewError}
        </p>
      )}
      {contingency.preview === null ? null : <PreviewList preview={contingency.preview} />}
    </section>
  );
}
