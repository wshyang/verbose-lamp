import type { AdminTeamChoiceView, FieldHelpTopic } from '@psd/contracts';
import { CheckField, ConsoleField } from '../../components/console/ConsoleField.js';
import { FieldHelp } from '../../components/console/FieldHelp.js';
import { useFieldHelp } from '../../lib/hooks/useFieldHelp.js';
import { FORMAT_CHOICES, type TournamentSetup } from '../../lib/hooks/useTournamentSetup.js';
import { stageFlowsOf } from '../../lib/hooks/stageFlowText.js';
import { StagePipelineEditor } from './StagePipelineEditor.js';

/**
 * ADR-279 — Setup: a draft first (name, the day's own rates, the teams in seed order), then Start (the
 * format, its options and the timing). The page shows the draft form until a draft exists, and the
 * Start form after: the teams are fixed the moment the draft is made.
 */

interface FieldProps {
  id: string;
  label: string;
  topic: FieldHelpTopic;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}

function NumberField(props: FieldProps) {
  return (
    <ConsoleField id={props.id} label={props.label} topic={props.topic}>
      <input
        className="console-input"
        inputMode="numeric"
        value={props.value}
        data-testid={props.testId}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </ConsoleField>
  );
}

function TeamPicker(props: { setup: TournamentSetup; teams: readonly AdminTeamChoiceView[] }) {
  const { setup } = props;
  const help = useFieldHelp();
  return (
    <fieldset className="console-panel">
      <legend>
        Teams, in seed order ({setup.draft.teamIds.length} picked)
        <FieldHelp label="Teams, in seed order" topic="setupTeams" help={help} />
      </legend>
      <button type="button" className="console-button" data-testid="tournament-setup__pick-all" onClick={setup.pickAll}>
        Enter every team
      </button>
      <ul className="console-list">
        {props.teams.map((team) => (
          <li key={team.id}>
            <label className="console-row">
              <input
                type="checkbox"
                aria-describedby={help.tooltipId}
                checked={setup.draft.teamIds.includes(team.id)}
                data-testid="tournament-setup__team"
                onChange={() => setup.toggleTeam(team.id)}
              />
              <span>{team.name}</span>
              <span className="console-meta">{team.memberCount} players</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function TierEditor(props: { setup: TournamentSetup }) {
  const help = useFieldHelp();
  const { setup } = props;
  const { draft } = setup;
  const setTier = (index: number, patch: Partial<{ label: string; points: string }>) =>
    setup.update({ dumbTiers: draft.dumbTiers.map((tier, at) => (at === index ? { ...tier, ...patch } : tier)) });
  const removeTier = (index: number) => setup.update({ dumbTiers: draft.dumbTiers.filter((_, at) => at !== index) });
  const addTier = () => setup.update({ dumbTiers: [...draft.dumbTiers, { label: '', points: '5' }] });
  return (
    <fieldset className="console-panel">
      <legend>
        Award tiers <FieldHelp label="Award tiers" topic="dumbTiers" help={help} />
      </legend>
      {draft.dumbTiers.map((tier, index) => (
        <div className="console-row" key={index}>
          <input
            className="console-input"
            value={tier.label}
            placeholder="Tier label, e.g. Gold"
            data-testid="tournament-setup__tier-label"
            onChange={(event) => setTier(index, { label: event.target.value })}
          />
          <input
            className="console-input"
            inputMode="numeric"
            value={tier.points}
            placeholder="Points"
            data-testid="tournament-setup__tier-points"
            onChange={(event) => setTier(index, { points: event.target.value })}
          />
          <button
            type="button"
            className="console-button"
            data-testid="tournament-setup__tier-remove"
            disabled={draft.dumbTiers.length <= 1}
            onClick={() => removeTier(index)}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="console-button"
        data-testid="tournament-setup__tier-add"
        disabled={draft.dumbTiers.length >= 4}
        onClick={addTier}
      >
        Add a tier
      </button>
    </fieldset>
  );
}

export function DraftForm(props: { setup: TournamentSetup; teams: readonly AdminTeamChoiceView[]; isPending: boolean }) {
  const { setup } = props;
  const { draft } = setup;
  return (
    <form
      data-testid="tournament-setup__draft"
      onSubmit={(event) => {
        event.preventDefault();
        void setup.createDraft();
      }}
    >
      <h2>New tournament</h2>
      <ConsoleField id="tournament-name" label="Name" topic="setupName">
        <input
          className="console-input"
          value={draft.name}
          data-testid="tournament-setup__name"
          onChange={(event) => setup.update({ name: event.target.value })}
        />
      </ConsoleField>
      <ConsoleField id="tournament-kind" label="Mode" topic="tournamentKind">
        <select
          className="console-input"
          value={draft.kind}
          data-testid="tournament-setup__kind"
          onChange={(event) => setup.update({ kind: event.target.value as typeof draft.kind })}
        >
          <option value="captains_ball">Captain's ball — fixtures and matches</option>
          <option value="dumb_courts">Dumb courts — courts award points, no fixtures</option>
        </select>
      </ConsoleField>
      {draft.kind === 'dumb_courts' ? <TierEditor setup={setup} /> : null}
      <div className="console-row">
        <NumberField id="tournament-win" label="Win points" topic="setupWinPoints" value={draft.winPoints} testId="tournament-setup__win" onChange={(winPoints) => setup.update({ winPoints })} />
        <NumberField id="tournament-draw" label="Draw points" topic="setupDrawPoints" value={draft.drawPoints} testId="tournament-setup__draw" onChange={(drawPoints) => setup.update({ drawPoints })} />
        <NumberField id="tournament-loss" label="Loss points" topic="setupLossPoints" value={draft.lossPoints} testId="tournament-setup__loss" onChange={(lossPoints) => setup.update({ lossPoints })} />
      </div>
      <TeamPicker setup={setup} teams={props.teams} />
      <button type="submit" className="console-button console-button--primary" disabled={props.isPending} data-testid="tournament-setup__create">
        Create the draft
      </button>
    </form>
  );
}

function FormatOptions(props: { setup: TournamentSetup }) {
  const { setup } = props;
  const { draft } = setup;
  const isGroups = draft.formatId === 'groups_knockout';
  const hasThirdPlaceOption = isGroups || draft.formatId === 'single_elimination' || draft.formatId === 'points_rush';
  return (
    <div className="console-row">
      {isGroups ? (
        <NumberField id="tournament-group-size" label="Group size" topic="setupGroupSize" value={draft.groupSize} testId="tournament-setup__group-size" onChange={(groupSize) => setup.update({ groupSize })} />
      ) : null}
      {isGroups ? (
        <NumberField id="tournament-advance" label="Go through per group" topic="setupAdvance" value={draft.advanceCount} testId="tournament-setup__advance" onChange={(advanceCount) => setup.update({ advanceCount })} />
      ) : null}
      {draft.formatId === 'swiss' ? (
        <NumberField id="tournament-rounds" label="Rounds (blank: enough to find a winner)" topic="setupRounds" value={draft.rounds} testId="tournament-setup__rounds" onChange={(rounds) => setup.update({ rounds })} />
      ) : null}
      {hasThirdPlaceOption ? (
        <CheckField id="tournament-third-place" label="Third-place match" topic="setupThirdPlace">
          <input
            type="checkbox"
            checked={draft.hasThirdPlace}
            data-testid="tournament-setup__third-place"
            onChange={(event) => setup.update({ hasThirdPlace: event.target.checked })}
          />
        </CheckField>
      ) : null}
    </div>
  );
}

function TimingFields(props: { setup: TournamentSetup }) {
  const { setup } = props;
  const { draft } = setup;
  return (
    <div className="console-row">
      <NumberField id="tournament-minutes" label="Match minutes" topic="setupMatchMinutes" value={draft.matchMinutes} testId="tournament-setup__minutes" onChange={(matchMinutes) => setup.update({ matchMinutes })} />
      <NumberField id="tournament-changeover" label="Changeover minutes" topic="setupChangeover" value={draft.changeoverMinutes} testId="tournament-setup__changeover" onChange={(changeoverMinutes) => setup.update({ changeoverMinutes })} />
      <NumberField id="tournament-rest" label="Rest minutes" topic="setupRest" value={draft.restMinutes} testId="tournament-setup__rest" onChange={(restMinutes) => setup.update({ restMinutes })} />
      <ConsoleField id="tournament-deadline" label="Hard stop (optional)" topic="setupDeadline">
        <input
          type="time"
          className="console-input"
          value={draft.deadline}
          data-testid="tournament-setup__deadline"
          onChange={(event) => setup.update({ deadline: event.target.value })}
        />
      </ConsoleField>
    </div>
  );
}

export function StartForm(props: { setup: TournamentSetup; entrantCount: number; isPending: boolean }) {
  const { setup } = props;
  const { draft } = setup;
  const help = useFieldHelp();
  const chosen = FORMAT_CHOICES.find((format) => format.id === draft.formatId);
  return (
    <form
      data-testid="tournament-setup__start-form"
      onSubmit={(event) => {
        event.preventDefault();
        void setup.start();
      }}
    >
      <h2>Start — {props.entrantCount} teams entered</h2>
      {draft.kind === 'dumb_courts' ? (
        <>
          <p className="console-muted" data-testid="tournament-setup__dumb-note">
            Dumb courts: no fixtures, no line-ups, nothing to schedule. Starting turns every court into an
            award station using these tiers:{' '}
            <strong>{draft.dumbTiers.map((tier) => `${tier.label} ${tier.points}`).join(' · ')}</strong>
            <FieldHelp label="Starting dumb courts" topic="dumbStart" help={help} />
          </p>
        </>
      ) : (
      <>
      <ConsoleField id="tournament-build" label="Build" topic="setupBuild">
        <select
          className="console-select"
          value={draft.buildMode}
          data-testid="tournament-setup__build"
          onChange={(event) => setup.update({ buildMode: event.target.value as typeof draft.buildMode })}
        >
          <option value="format">One format for the whole tournament</option>
          <option value="pipeline">Stage by stage — each with its own format and minutes</option>
        </select>
      </ConsoleField>
      {draft.buildMode === 'pipeline' ? (
        <StagePipelineEditor
          testPrefix="tournament-setup"
          stages={draft.stages}
          flows={stageFlowsOf(draft.stages, props.entrantCount)}
          onChange={setup.updateStage}
          onAdd={setup.addStage}
          onRemove={setup.removeStage}
          onMove={setup.moveStage}
          onResetTemplate={setup.resetStages}
        />
      ) : (
        <>
          <ConsoleField id="tournament-format" label="Format" topic="setupFormat">
            <select
              className="console-select"
              value={draft.formatId}
              data-testid="tournament-setup__format"
              onChange={(event) => setup.update({ formatId: event.target.value as typeof draft.formatId })}
            >
              {FORMAT_CHOICES.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label} ({format.minTeams}–{format.maxTeams} teams)
                </option>
              ))}
            </select>
          </ConsoleField>
          <p className="console-meta" data-testid="tournament-setup__summary">
            {chosen?.summary}
          </p>
          <FormatOptions setup={setup} />
        </>
      )}
      <TimingFields setup={setup} />
      {setup.startProblem === null ? null : (
        <p className="console-warning" role="status" data-testid="tournament-setup__problem">
          {setup.startProblem}
        </p>
      )}
      </>)}
      <div className="console-row">
        <button
          type="submit"
          className="console-button console-button--primary"
          disabled={props.isPending || setup.startProblem !== null}
          data-testid="tournament-setup__start"
        >
          {draft.kind === 'dumb_courts' ? 'Start dumb courts' : 'Start the tournament'}
        </button>
        <button type="button" className="console-button console-button--ghost" disabled={props.isPending} data-testid="tournament-setup__discard" onClick={() => void setup.discard()}>
          Discard the draft
        </button>
      </div>
    </form>
  );
}
