import type { FieldHelpTopic } from '@psd/contracts';
import { CheckField, ConsoleField } from '../../components/console/ConsoleField.js';
import type { StageDraft } from '../../lib/hooks/useTournamentSetup.js';
import { sourceChoicesOf } from '../../lib/hooks/useTournamentSetup.js';
import type { StageFlowText } from '../../lib/hooks/stageFlowText.js';

/**
 * ADR-311 — the stage builder: an ordered list of stages, each with its own format,
 * entrant source and match minutes. Shared by the desk's Start form and the Simulator
 * so a day rehearsed stage by stage is built by the same fields that start it. The
 * template is the default presentation; every stage here can be edited, moved or
 * deleted, and the list can be emptied and written from scratch.
 */

export interface StagePipelineEditorProps {
  /** Test-id prefix: `tournament-setup` at the desk, `simulator` in the rehearsal. */
  testPrefix: string;
  stages: readonly StageDraft[];
  /** ADR-325 — what each stage takes in and sends on, one entry per stage, computed by the hook. */
  flows: readonly StageFlowText[];
  onChange: (index: number, patch: Partial<StageDraft>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onResetTemplate: () => void;
}

interface FieldProps {
  id: string;
  label: string;
  topic: FieldHelpTopic;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}

function TextField(props: FieldProps) {
  return (
    <ConsoleField id={props.id} label={props.label} topic={props.topic}>
      <input className="console-input" value={props.value} data-testid={props.testId} onChange={(event) => props.onChange(event.target.value)} />
    </ConsoleField>
  );
}

/** ADR-325 — where this stage's teams come from. Every format shows it; position decides what is offered. */
function SourceRow(props: { editor: StagePipelineEditorProps; index: number; stage: StageDraft }) {
  const { editor, index, stage } = props;
  const prefix = `${editor.testPrefix}__stage-${index}`;
  const set = (patch: Partial<StageDraft>) => editor.onChange(index, patch);
  const choices = sourceChoicesOf(index, editor.stages);
  const blocked = choices.find((choice) => !choice.isEnabled);
  const earlierCodes = editor.stages.slice(0, index).map((row) => row.code.trim()).filter((code) => code !== '');
  return (
    <div className="console-row">
      <ConsoleField id={`${prefix}-source`} label="Teams come from" topic="stageSource">
        <select
          className="console-select"
          value={stage.sourceKind}
          data-testid={`${prefix}-source`}
          aria-describedby={blocked === undefined ? undefined : `${prefix}-source-reason`}
          onChange={(event) => set({ sourceKind: event.target.value as StageDraft['sourceKind'] })}
        >
          {choices.map((choice) => (
            <option key={choice.kind} value={choice.kind} disabled={!choice.isEnabled}>
              {choice.label}
            </option>
          ))}
        </select>
      </ConsoleField>
      {blocked?.reason ? (
        <span id={`${prefix}-source-reason`} className="console-meta">
          {blocked.reason}
        </span>
      ) : null}
      {stage.sourceKind === 'advancers' ? (
        <>
          <ConsoleField id={`${prefix}-from`} label="Earlier stage" topic="stageFrom">
            <select className="console-select" value={stage.fromStage} data-testid={`${prefix}-from`} onChange={(event) => set({ fromStage: event.target.value })}>
              <option value="">Choose a stage…</option>
              {earlierCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </ConsoleField>
          <TextField id={`${prefix}-count`} label="How many go through" topic="stageCount" value={stage.advancerCount} testId={`${prefix}-count`} onChange={(advancerCount) => set({ advancerCount })} />
        </>
      ) : null}
      {stage.format === 'bracket' ? (
        <CheckField id={`${prefix}-third-place`} label="Third-place match" topic="stageThirdPlace">
          <input type="checkbox" checked={stage.hasThirdPlace} data-testid={`${prefix}-third-place`} onChange={(event) => set({ hasThirdPlace: event.target.checked })} />
        </CheckField>
      ) : null}
    </div>
  );
}

/**
 * ADR-325 — what this stage takes in, plays and sends on, as read-only text. It is the engine's
 * own description of the stage as configured, so it changes as the fields do; when the stage cannot
 * be built it is the engine's sentence instead of a number that would be wrong.
 */
function FlowStrip(props: { prefix: string; flow: StageFlowText | undefined }) {
  const { prefix, flow } = props;
  if (flow === undefined) return null;
  if (flow.problem !== null) {
    return (
      <p className="console-meta" role="status" data-testid={`${prefix}-problem`}>
        {flow.problem}
      </p>
    );
  }
  return (
    <ul className="console-meta stage-flow" data-testid={`${prefix}-flow`} aria-label="What this stage takes in and sends on">
      <li data-testid={`${prefix}-ingress`}>{flow.ingress}</li>
      <li data-testid={`${prefix}-shape`}>{flow.shape}</li>
      <li data-testid={`${prefix}-egress`}>{flow.egress}</li>
    </ul>
  );
}

function StageCard(props: { editor: StagePipelineEditorProps; index: number; stage: StageDraft }) {
  const { editor, index, stage } = props;
  const prefix = `${editor.testPrefix}__stage-${index}`;
  const set = (patch: Partial<StageDraft>) => editor.onChange(index, patch);
  return (
    <fieldset className="console-panel" data-testid={prefix}>
      <legend>
        Stage {index + 1}
        {stage.code.trim() === '' ? '' : ` — ${stage.code.trim()}`}
      </legend>
      <div className="console-row">
        <TextField id={`${prefix}-code`} label="Code" topic="stageCode" value={stage.code} testId={`${prefix}-code`} onChange={(code) => set({ code })} />
        <TextField id={`${prefix}-label`} label="Name" topic="stageName" value={stage.label} testId={`${prefix}-label`} onChange={(label) => set({ label })} />
        <ConsoleField id={`${prefix}-format`} label="Format" topic="stageFormat">
          <select
            className="console-select"
            value={stage.format}
            data-testid={`${prefix}-format`}
            onChange={(event) => {
              const format = event.target.value as StageDraft['format'];
              // ADR-325 — any format may take either source; changing format changes nothing else.
              set({ format });
            }}
          >
            <option value="pool">Pool (groups)</option>
            <option value="bracket">Knockout bracket</option>
            <option value="open">Open play</option>
          </select>
        </ConsoleField>
        <TextField
          id={`${prefix}-minutes`}
          label="Match minutes (blank: tournament's)"
          topic="stageMinutes"
          value={stage.matchMinutes}
          testId={`${prefix}-minutes`}
          onChange={(matchMinutes) => set({ matchMinutes })}
        />
      </div>

      {stage.format === 'pool' ? (
        <div className="console-row">
          <TextField id={`${prefix}-group-size`} label="Group size (blank: 4)" topic="stageGroupSize" value={stage.groupSize} testId={`${prefix}-group-size`} onChange={(groupSize) => set({ groupSize })} />
          <TextField id={`${prefix}-group-count`} label="Groups (blank: from size)" topic="stageGroupCount" value={stage.groupCount} testId={`${prefix}-group-count`} onChange={(groupCount) => set({ groupCount })} />
          <TextField id={`${prefix}-advance`} label="Go through per group" topic="stageAdvance" value={stage.advanceCount} testId={`${prefix}-advance`} onChange={(advanceCount) => set({ advanceCount })} />
        </div>
      ) : null}

      <SourceRow editor={editor} index={index} stage={stage} />
      <FlowStrip prefix={prefix} flow={editor.flows[index]} />

      {stage.format === 'open' ? <p className="console-meta">No fixtures are built; play in this stage is staged by hand.</p> : null}

      {stage.format !== 'open' ? (
        <div className="console-row">
          <TextField id={`${prefix}-win`} label="Win pts (blank: tournament's)" topic="stageWin" value={stage.winPoints} testId={`${prefix}-win`} onChange={(winPoints) => set({ winPoints })} />
          <TextField id={`${prefix}-draw`} label="Draw pts" topic="stageDraw" value={stage.drawPoints} testId={`${prefix}-draw`} onChange={(drawPoints) => set({ drawPoints })} />
          <TextField id={`${prefix}-loss`} label="Loss pts" topic="stageLoss" value={stage.lossPoints} testId={`${prefix}-loss`} onChange={(lossPoints) => set({ lossPoints })} />
        </div>
      ) : null}

      <div className="console-row">
        <TextField id={`${prefix}-table-win`} label="Table win pts (blank: 3)" topic="stageTableWin" value={stage.tableWinPoints} testId={`${prefix}-table-win`} onChange={(tableWinPoints) => set({ tableWinPoints })} />
        <TextField id={`${prefix}-table-draw`} label="Table draw pts (blank: 1)" topic="stageTableDraw" value={stage.tableDrawPoints} testId={`${prefix}-table-draw`} onChange={(tableDrawPoints) => set({ tableDrawPoints })} />
        <TextField id={`${prefix}-table-loss`} label="Table loss pts (blank: 0)" topic="stageTableLoss" value={stage.tableLossPoints} testId={`${prefix}-table-loss`} onChange={(tableLossPoints) => set({ tableLossPoints })} />
      </div>

      <div className="console-row">
        <button type="button" className="console-button" disabled={index === 0} data-testid={`${prefix}-up`} onClick={() => editor.onMove(index, -1)}>
          Move up
        </button>
        <button
          type="button"
          className="console-button"
          disabled={index === editor.stages.length - 1}
          data-testid={`${prefix}-down`}
          onClick={() => editor.onMove(index, 1)}
        >
          Move down
        </button>
        <button type="button" className="console-button console-button--danger" data-testid={`${prefix}-remove`} onClick={() => editor.onRemove(index)}>
          Remove stage
        </button>
      </div>
    </fieldset>
  );
}

export function StagePipelineEditor(props: StagePipelineEditorProps) {
  return (
    <div data-testid={`${props.testPrefix}__stages`}>
      {props.stages.map((stage, index) => (
        <StageCard key={index} editor={props} index={index} stage={stage} />
      ))}
      {props.stages.length === 0 ? <p className="console-meta">No stages yet — the tournament is whatever you add.</p> : null}
      <div className="console-row">
        <button type="button" className="console-button" data-testid={`${props.testPrefix}__stage-add`} onClick={props.onAdd}>
          Add a stage
        </button>
        <button type="button" className="console-button" data-testid={`${props.testPrefix}__stage-template`} onClick={props.onResetTemplate}>
          Reset to the groups → knockout template
        </button>
      </div>
    </div>
  );
}
