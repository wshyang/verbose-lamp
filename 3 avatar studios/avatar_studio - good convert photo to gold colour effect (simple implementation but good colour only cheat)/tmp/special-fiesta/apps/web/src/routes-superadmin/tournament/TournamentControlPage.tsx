import type { AdminEntrantView, AdminMatchView, AdminStageView, AdminTournamentView } from '@psd/contracts';
import { ConsoleField } from '../../components/console/ConsoleField.js';
import { ReasonDialog } from '../../components/console/ReasonDialog.js';
import { StateMessage } from '../../components/shared/StateMessage.js';
import { useContingency } from '../../lib/hooks/useContingency.js';
import { useMatchPlacement } from '../../lib/hooks/useMatchPlacement.js';
import { useTournamentCourts } from '../../lib/hooks/useTournamentCourts.js';
import { useTournamentActs, type TournamentActs } from '../../lib/hooks/useTournamentActs.js';
import { useTournamentDesk, type TournamentDesk } from '../../lib/hooks/useTournamentDesk.js';
import { useTournamentSetup } from '../../lib/hooks/useTournamentSetup.js';
import { useTournamentSwitch } from '../../lib/hooks/useTournamentSwitch.js';
import { AdminShell } from '../AdminShell.js';
import { CourtsPanel } from './CourtsPanel.js';
import { ContingencyPanel, EntrantsPanel, SchedulerPanel, StagesPanel } from './DayPanel.js';
import { MatchesPanel } from './MatchesPanel.js';
import { ModePanel } from './ModePanel.js';
import { PlacementForm } from './PlacementForm.js';
import { DraftForm, StartForm } from './SetupPanel.js';
import { TournamentTabs } from './TournamentTabs.js';

/**
 * ADR-279 — the Control subtab: set the day up, then run it. Before a tournament exists (or after one
 * closes) it offers a new draft; with a draft, Start; once live, the scheduler, the matches, the
 * stages, the teams and the courts — every reason-gated act behind the one ReasonDialog. ADR-288 — the
 * venue's courts are listed and edited below, whatever the phase.
 */

/** ADR-329 F2 — who takes each place when the desk overrules the table, one picker per place. */
function StageOverrideFields(props: { acts: TournamentActs; stage: AdminStageView; entrants: readonly AdminEntrantView[] }) {
  const { acts, stage, entrants } = props;
  return (
    <div>
      {stage.cutTies.length > 0 ? (
        <p className="console-warning" data-testid="tournament-act__cut-ties">
          Tie on the cut: {stage.cutTies.join(' · ')} — pick who takes the tied place below.
        </p>
      ) : null}
      {stage.advancers.map((advancer) => (
        <ConsoleField key={advancer.place} id={`act-override-${advancer.place}`} label={`#${advancer.place} — ${advancer.name}${advancer.via === 'fill' ? ' (fill)' : ''}`} topic="actStageOverride">
          <select
            id={`act-override-${advancer.place}`}
            className="console-select"
            data-testid="tournament-act__override"
            value={acts.extras.overridePlaces[String(advancer.place)] ?? ''}
            onChange={(event) => acts.patchExtras({ overridePlaces: { ...acts.extras.overridePlaces, [advancer.place]: event.target.value } })}
          >
            <option value="">Table’s choice — {advancer.name}</option>
            {entrants.map((entrant) => (
              <option key={entrant.teamId} value={entrant.teamId}>
                {entrant.name}
              </option>
            ))}
          </select>
        </ConsoleField>
      ))}
    </div>
  );
}

/** ADR-329 F3 — the seat and the team that takes it. */
function ReseatFields(props: { acts: TournamentActs; entrants: readonly AdminEntrantView[] }) {
  const { acts, entrants } = props;
  return (
    <div className="console-row">
      <ConsoleField id="act-reseat-side" label="Seat" topic="actReseatSide">
        <select
          id="act-reseat-side"
          className="console-select"
          data-testid="tournament-act__reseat-side"
          value={acts.extras.reseatSide}
          onChange={(event) => acts.patchExtras({ reseatSide: event.target.value as 'a' | 'b' })}
        >
          <option value="a">Side A</option>
          <option value="b">Side B</option>
        </select>
      </ConsoleField>
      <ConsoleField id="act-reseat-team" label="Team taking the seat" topic="actReseatTeam">
        <select
          id="act-reseat-team"
          className="console-select"
          data-testid="tournament-act__reseat-team"
          value={acts.extras.reseatTeamId}
          onChange={(event) => acts.patchExtras({ reseatTeamId: event.target.value })}
        >
          <option value="">— select —</option>
          {entrants.map((entrant) => (
            <option key={entrant.teamId} value={entrant.teamId}>
              {entrant.name}
            </option>
          ))}
        </select>
      </ConsoleField>
    </div>
  );
}

/** ADR-334 — the restage knobs; an empty box keeps the plan's value. */
function RestageFields(props: { acts: TournamentActs }) {
  const { acts } = props;
  const stage = acts.act?.kind === 'restage' ? acts.act.stage : null;
  if (stage === null) return null;
  return (
    <div>
      <p className="console-meta" data-testid="tournament-act__restage-stage">
        {stage.label} has not started and has not been fed, so it can be rebuilt from the plan. The fixtures it replaces stay in the day’s history.
      </p>
      <div className="console-row">
        <ConsoleField id="act-restage-group-size" label="Teams per group" topic="restageStructure">
          <input className="console-input" inputMode="numeric" value={acts.extras.restageGroupSize} data-testid="tournament-act__restage-group-size" onChange={(event) => acts.patchExtras({ restageGroupSize: event.target.value })} />
        </ConsoleField>
        <ConsoleField id="act-restage-advance" label="Through from each group" topic="restageStructure">
          <input className="console-input" inputMode="numeric" value={acts.extras.restageAdvanceCount} data-testid="tournament-act__restage-advance" onChange={(event) => acts.patchExtras({ restageAdvanceCount: event.target.value })} />
        </ConsoleField>
        <ConsoleField id="act-restage-third" label="Third-place match" topic="restageStructure">
          <select id="act-restage-third" className="console-select" data-testid="tournament-act__restage-third" value={acts.extras.restageThirdPlace} onChange={(event) => acts.patchExtras({ restageThirdPlace: event.target.value as typeof acts.extras.restageThirdPlace })}>
            <option value="keep">Keep the plan’s choice</option>
            <option value="yes">Play one</option>
            <option value="no">No third-place match</option>
          </select>
        </ConsoleField>
      </div>
      <div className="console-row">
        <ConsoleField id="act-restage-intake" label="Teams coming through" topic="restageIntake">
          <input className="console-input" inputMode="numeric" value={acts.extras.restageIntakeCount} data-testid="tournament-act__restage-intake" onChange={(event) => acts.patchExtras({ restageIntakeCount: event.target.value })} />
        </ConsoleField>
        <ConsoleField id="act-restage-minutes" label="Match minutes" topic="restageMinutes">
          <input className="console-input" inputMode="numeric" value={acts.extras.restageMinutes} data-testid="tournament-act__restage-minutes" onChange={(event) => acts.patchExtras({ restageMinutes: event.target.value })} />
        </ConsoleField>
        <ConsoleField id="act-restage-table-points" label="Table points (win draw loss)" topic="restageTablePoints">
          <input className="console-input" value={acts.extras.restageTablePoints} data-testid="tournament-act__restage-table-points" onChange={(event) => acts.patchExtras({ restageTablePoints: event.target.value })} />
        </ConsoleField>
      </div>
    </div>
  );
}

function ActFields(props: { acts: TournamentActs; entrants: readonly AdminEntrantView[] }) {
  const { acts } = props;
  if (acts.act?.kind === 'completeStage' && acts.act.stage !== undefined) {
    return <StageOverrideFields acts={acts} stage={acts.act.stage} entrants={props.entrants} />;
  }
  if (acts.act?.kind === 'restage') {
    return <RestageFields acts={acts} />;
  }
  if (acts.act?.kind === 'reseat') {
    return <ReseatFields acts={acts} entrants={props.entrants} />;
  }
  if (acts.act?.kind === 'correct') {
    return (
      <>
        <div className="console-row">
          <ConsoleField id="act-score-a" label="Score A" topic="actScoreA">
            <input className="console-input" inputMode="numeric" value={acts.extras.scoreA} data-testid="tournament-act__score-a" onChange={(event) => acts.patchExtras({ scoreA: event.target.value })} />
          </ConsoleField>
          <ConsoleField id="act-score-b" label="Score B" topic="actScoreB">
            <input className="console-input" inputMode="numeric" value={acts.extras.scoreB} data-testid="tournament-act__score-b" onChange={(event) => acts.patchExtras({ scoreB: event.target.value })} />
          </ConsoleField>
        </div>
        {/* ADR-329 F5 — a corrected level knockout can be settled off the scoreboard. */}
        <div className="console-row">
          <ConsoleField id="act-tiebreak-method" label="Tiebreak (level knockout only)" topic="actTiebreakMethod">
            <select
              id="act-tiebreak-method"
              className="console-select"
              data-testid="tournament-act__tiebreak-method"
              value={acts.extras.tiebreakMethod}
              onChange={(event) => acts.patchExtras({ tiebreakMethod: event.target.value as typeof acts.extras.tiebreakMethod })}
            >
              <option value="">None — the score decides</option>
              <option value="coin_toss">Coin toss</option>
              <option value="rock_paper_scissors">Scissors-paper-stone</option>
            </select>
          </ConsoleField>
          <ConsoleField id="act-tiebreak-winner" label="Tiebreak winner" topic="actTiebreakWinner">
            <select
              id="act-tiebreak-winner"
              className="console-select"
              data-testid="tournament-act__tiebreak-winner"
              value={acts.extras.tiebreakWinnerSide}
              onChange={(event) => acts.patchExtras({ tiebreakWinnerSide: event.target.value as typeof acts.extras.tiebreakWinnerSide })}
            >
              <option value="">—</option>
              <option value="a">Side A</option>
              <option value="b">Side B</option>
            </select>
          </ConsoleField>
        </div>
      </>
    );
  }
  if (acts.act?.kind === 'award') {
    return (
      <ConsoleField id="act-points" label="Points (−100 to 100, not 0)" topic="actPoints">
        <input className="console-input" inputMode="numeric" value={acts.extras.points} data-testid="tournament-act__points" onChange={(event) => acts.patchExtras({ points: event.target.value })} />
      </ConsoleField>
    );
  }
  return null;
}

function ActDialog(props: { acts: TournamentActs; desk: TournamentDesk }) {
  const { acts, desk } = props;
  if (acts.act === null) return null;
  return (
    <ReasonDialog
      title={acts.title}
      reason={acts.reason}
      onReasonChange={acts.setReason}
      onConfirm={() => void acts.confirm()}
      onCancel={acts.cancel}
      isBusy={desk.isPending}
      error={desk.error}
    >
      <ActFields acts={acts} entrants={desk.tournament?.entrants ?? []} />
    </ReasonDialog>
  );
}

/** Only mounted for a live day, so the tournament is always there. */
function LiveDay(props: { desk: TournamentDesk; tournament: AdminTournamentView; acts: TournamentActs }) {
  const { desk, tournament, acts } = props;
  const stageTimings = tournament.stages.flatMap((stage) => {
    const unplayed = tournament.matches.find((match) => match.stageId === stage.id && match.status === 'scheduled');
    return unplayed === undefined ? [] : [{ id: stage.id, label: stage.label, matchMinutes: unplayed.plannedMinutes }];
  });
  const contingency = useContingency({ desk, courts: desk.courts, scheduler: tournament.scheduler, stageTimings });
  const placement = useMatchPlacement(desk);
  const placementActs = { onPlace: placement.open, onRelease: (match: AdminMatchView) => void placement.release(match) };
  return (
    <>
      <SchedulerPanel tournament={tournament} onAct={acts.open} />
      {placement.moving === null ? null : <PlacementForm placement={placement} match={placement.moving} courts={desk.courts} isPending={desk.isPending} />}
      <MatchesPanel groups={desk.groups} onAct={acts.open} placement={placementActs} />
      <StagesPanel stages={tournament.stages} canRestage={tournament.scheduler?.format === 'pipeline'} onAct={acts.open} />
      <EntrantsPanel entrants={tournament.entrants} onAct={acts.open} />
      <ContingencyPanel contingency={contingency} courts={desk.courts} stageTimings={stageTimings} isPending={desk.isPending} />
    </>
  );
}

function SetupOrStart(props: { desk: TournamentDesk }) {
  const { desk } = props;
  const entrantCount = desk.phase === 'draft' && desk.tournament !== null ? desk.tournament.entrants.length : 0;
  const setup = useTournamentSetup({ desk, teams: desk.teams, entrantCount, tournament: desk.tournament });
  return (
    <section className="console-panel" data-testid="tournament-setup">
      {desk.phase === 'draft' ? (
        <StartForm setup={setup} entrantCount={entrantCount} isPending={desk.isPending} />
      ) : (
        <DraftForm setup={setup} teams={desk.teams} isPending={desk.isPending} />
      )}
    </section>
  );
}

function ClosedNote(props: { desk: TournamentDesk }) {
  const closed = props.desk.phase === 'closed' ? props.desk.tournament : null;
  if (closed === null) return null;
  const reason = closed.closeReason === null ? '.' : `: ${closed.closeReason}`;
  return (
    <p className="console-meta" data-testid="tournament-control__closed">
      {closed.name} closed{reason}
    </p>
  );
}

export function TournamentControlPage() {
  const desk = useTournamentDesk();
  const acts = useTournamentActs(desk);
  const switchForm = useTournamentSwitch(desk);
  const courts = useTournamentCourts(desk);
  const isLive = desk.phase === 'live';
  const isPageError = desk.error !== null && acts.act === null;
  return (
    <AdminShell title="Tournament">
      <TournamentTabs />
      <StateMessage isLoading={desk.isLoading} error={desk.loadError} isEmpty={false} emptyText="" testId="tournament-control" />
      {isPageError ? (
        <p className="console-danger" role="alert" data-testid="tournament-control__error">
          {desk.error}
        </p>
      ) : null}
      <ClosedNote desk={desk} />
      <ModePanel desk={desk} tournament={desk.tournament} form={switchForm} />
      {isLive && desk.tournament !== null ? <LiveDay desk={desk} tournament={desk.tournament} acts={acts} /> : <SetupOrStart desk={desk} />}
      <CourtsPanel list={desk.courts} courts={courts} isLive={isLive} isPending={desk.isPending} />
      <ActDialog acts={acts} desk={desk} />
    </AdminShell>
  );
}
