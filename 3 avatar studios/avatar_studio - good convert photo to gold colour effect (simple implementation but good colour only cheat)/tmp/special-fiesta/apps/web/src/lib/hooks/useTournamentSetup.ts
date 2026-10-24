import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminTeamChoiceView, AdminTournamentView, TournamentDraftSetup, TournamentFormatId, TournamentKind } from '@psd/contracts';
import {
  FORMATS,
  defaultPipelineSpec,
  findFormat,
  validatePipeline,
  type PipelineSpec,
  type StageOptions,
  type StageSpec,
} from '@psd/tournament/scheduler';
import * as desk from '../api/tournament.js';
import type { TournamentDesk } from './useTournamentDesk.js';

/**
 * ADR-279 — the Control subtab's setup: a draft (name, rates, teams in seed order), then Start (the
 * format, its options, the day's timing). The format list and its validation are the engine's own
 * (`@psd/tournament/scheduler`), so the form refuses a field the format cannot play before the server
 * would, in the same words.
 */

export interface SetupDraft {
  name: string;
  /** ADR-293/321 — which game type to run: captain's ball fixtures, or dumb courts that only award. */
  kind: TournamentKind;
  /** ADR-321 — dumb courts only: the award tiers, as label/points strings until creation parses them. */
  dumbTiers: { label: string; points: string }[];
  winPoints: string;
  drawPoints: string;
  lossPoints: string;
  /** Picked teams in seed order. */
  teamIds: string[];
  formatId: TournamentFormatId;
  groupSize: string;
  advanceCount: string;
  hasThirdPlace: boolean;
  rounds: string;
  matchMinutes: string;
  changeoverMinutes: string;
  restMinutes: string;
  /** Local time of day, `HH:MM`, or '' for no hard stop. */
  deadline: string;
  /** ADR-311 — build one format for the whole day, or compose it stage by stage. */
  buildMode: 'format' | 'pipeline';
  /** The stage list, read when `buildMode` is 'pipeline'. */
  stages: StageDraft[];
}

export const INITIAL_SETUP: SetupDraft = {
  name: 'Captain’s ball',
  kind: 'captains_ball',
  dumbTiers: [
    { label: 'Played', points: '2' },
    { label: 'Gold', points: '10' },
  ],
  winPoints: '30',
  drawPoints: '20',
  lossPoints: '10',
  teamIds: [],
  formatId: 'groups_knockout',
  groupSize: '4',
  advanceCount: '2',
  hasThirdPlace: true,
  rounds: '',
  matchMinutes: '12',
  changeoverMinutes: '3',
  restMinutes: '0',
  deadline: '',
  buildMode: 'format',
  stages: templateStages(),
};

/**
 * ADR-311 — one stage of the pipeline builder, as form text. The template is the engine's own
 * `defaultPipelineSpec` read into fields; deleting every stage and writing your own changes
 * nothing about the machinery — the spec sent to Start is whatever the list says.
 */
export interface StageDraft {
  code: string;
  label: string;
  format: 'pool' | 'bracket' | 'open';
  sourceKind: 'initial' | 'advancers';
  /** The earlier stage advancers come from, by code. */
  fromStage: string;
  advancerCount: string;
  /** Blank: inherit the tournament's match minutes. */
  matchMinutes: string;
  groupSize: string;
  /** Blank: as many groups as the group size implies. */
  groupCount: string;
  advanceCount: string;
  hasThirdPlace: boolean;
  /** Point rates for this stage; all three blank inherits the tournament's. */
  winPoints: string;
  drawPoints: string;
  lossPoints: string;
  /** ADR-320 — the stage's internal table points; all three blank ranks on the default 3/1/0. */
  tableWinPoints: string;
  tableDrawPoints: string;
  tableLossPoints: string;
}

function textOf(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** A win/draw/loss triple as form text: all blank when the stage sets none. */
function pointsText(points: { win: number; draw: number; loss: number } | null): { win: string; draw: string; loss: string } {
  return points === null ? { win: '', draw: '', loss: '' } : { win: String(points.win), draw: String(points.draw), loss: String(points.loss) };
}

/** The win/draw/loss the three fields describe, or null when any is blank. */
function filledPoints(texts: readonly [string, string, string]): { win: number; draw: number; loss: number } | null {
  const [win, draw, loss] = texts.map((text) => filledNumber(text));
  return win !== null && win !== undefined && draw !== null && draw !== undefined && loss !== null && loss !== undefined ? { win, draw, loss } : null;
}

/** How many of a win/draw/loss triple are filled in. */
function filledCount(texts: readonly string[]): number {
  return texts.filter((text) => text.trim() !== '').length;
}

export function stageDraftOf(stage: StageSpec): StageDraft {
  const options = stage.options ?? {};
  const rates = pointsText(options.rates ?? null);
  const tablePoints = pointsText(options.tablePoints ?? null);
  const advancers = stage.source.kind === 'advancers' ? stage.source : null;
  return {
    code: stage.code,
    label: stage.label,
    format: stage.format,
    sourceKind: stage.source.kind,
    fromStage: advancers?.fromStage ?? '',
    advancerCount: advancers === null ? '4' : String(advancers.count),
    matchMinutes: stage.matchMinutes === null ? '' : String(stage.matchMinutes),
    groupSize: textOf(options.groupSize),
    groupCount: textOf(options.groupCount),
    advanceCount: textOf(options.advanceCount),
    hasThirdPlace: options.hasThirdPlace ?? false,
    winPoints: rates.win,
    drawPoints: rates.draw,
    lossPoints: rates.loss,
    tableWinPoints: tablePoints.win,
    tableDrawPoints: tablePoints.draw,
    tableLossPoints: tablePoints.loss,
  };
}

/** The template as a starting point: groups at 15, the top four cross-seeded at 20. */
export function templateStages(): StageDraft[] {
  return defaultPipelineSpec().stages.map(stageDraftOf);
}

/** A stage the desk adds: a bracket fed by the entered teams, at the tournament's length. */
export function blankStage(index: number): StageDraft {
  return {
    code: `S${index + 1}`,
    label: `Stage ${index + 1}`,
    format: 'bracket',
    sourceKind: 'initial',
    fromStage: '',
    advancerCount: '4',
    matchMinutes: '',
    groupSize: '',
    groupCount: '',
    advanceCount: '',
    hasThirdPlace: false,
    winPoints: '',
    drawPoints: '',
    lossPoints: '',
    tableWinPoints: '',
    tableDrawPoints: '',
    tableLossPoints: '',
  };
}

export function patchStage(stages: readonly StageDraft[], index: number, patch: Partial<StageDraft>): StageDraft[] {
  return stages.map((stage, at) => (at === index ? { ...stage, ...patch } : stage));
}

export function withoutStage(stages: readonly StageDraft[], index: number): StageDraft[] {
  return stages.filter((_, at) => at !== index);
}

export function movedStage(stages: readonly StageDraft[], index: number, direction: -1 | 1): StageDraft[] {
  const target = index + direction;
  if (target < 0 || target >= stages.length) return [...stages];
  const next = [...stages];
  const [stage] = next.splice(index, 1);
  if (stage !== undefined) next.splice(target, 0, stage);
  return next;
}

function filledNumber(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isInteger(value) ? value : Number.NaN;
}

/** The spec the stage list describes. Only read it once `pipelineProblem` has cleared it. */
export function specOfStages(stages: readonly StageDraft[]): PipelineSpec {
  return {
    stages: stages.map((stage) => {
      const minutes = filledNumber(stage.matchMinutes);
      const groupSize = filledNumber(stage.groupSize);
      const groupCount = filledNumber(stage.groupCount);
      const advanceCount = filledNumber(stage.advanceCount);
      const rates = filledPoints([stage.winPoints, stage.drawPoints, stage.lossPoints]);
      const tablePoints = filledPoints([stage.tableWinPoints, stage.tableDrawPoints, stage.tableLossPoints]);
      return {
        code: stage.code.trim(),
        label: stage.label.trim(),
        format: stage.format,
        source:
          stage.sourceKind === 'advancers'
            ? { kind: 'advancers' as const, fromStage: stage.fromStage.trim(), count: filledNumber(stage.advancerCount) ?? Number.NaN }
            : { kind: 'initial' as const },
        matchMinutes: minutes,
        options: {
          ...(groupSize !== null ? { groupSize } : {}),
          ...(groupCount !== null ? { groupCount } : {}),
          ...(advanceCount !== null ? { advanceCount } : {}),
          ...(stage.format === 'bracket' ? { hasThirdPlace: stage.hasThirdPlace } : {}),
          ...(rates !== null ? { rates } : {}),
          ...(tablePoints !== null ? { tablePoints } : {}),
        },
      };
    }),
  };
}

const NUMBER_FIELDS: readonly (readonly [keyof StageDraft, string])[] = [
  ['matchMinutes', 'Match minutes'],
  ['groupSize', 'Group size'],
  ['groupCount', 'Groups'],
  ['advanceCount', 'Go through per group'],
  ['advancerCount', 'Advancers'],
  ['winPoints', 'Win points'],
  ['drawPoints', 'Draw points'],
  ['lossPoints', 'Loss points'],
  ['tableWinPoints', 'Table win points'],
  ['tableDrawPoints', 'Table draw points'],
  ['tableLossPoints', 'Table loss points'],
];

/** A win/draw/loss triple is filled whole or not at all — paid rates and table points alike. */
function tripleProblem(name: string, stage: StageDraft): string | null {
  const triples: readonly (readonly [readonly string[], string])[] = [
    [[stage.winPoints, stage.drawPoints, stage.lossPoints], 'point rates'],
    [[stage.tableWinPoints, stage.tableDrawPoints, stage.tableLossPoints], 'table points'],
  ];
  for (const [texts, label] of triples) {
    const filled = filledCount(texts);
    if (filled > 0 && filled < 3) return `${name}: ${label} need a win, a draw and a loss, or none.`;
  }
  return null;
}

function stageFieldProblem(stage: StageDraft, index: number): string | null {
  const name = stage.code.trim() === '' ? `Stage ${index + 1}` : stage.code.trim();
  if (stage.code.trim() === '') return `Stage ${index + 1} needs a code.`;
  if (stage.label.trim() === '') return `${name} needs a name.`;
  for (const [field, label] of NUMBER_FIELDS) {
    const text = stage[field];
    if (typeof text === 'string' && text.trim() !== '' && Number.isNaN(filledNumber(text))) {
      return `${name}: ${label.toLowerCase()} must be a whole number.`;
    }
  }
  const triple = tripleProblem(name, stage);
  if (triple !== null) return triple;
  if (stage.sourceKind === 'advancers' && stage.fromStage.trim() === '') return `${name}: advancers need a stage to come from.`;
  return null;
}

/** Why this stage list cannot start a tournament, or null when it can (the engine's validator). */
export function pipelineProblem(stages: readonly StageDraft[], teamCount: number): string | null {
  for (const [index, stage] of stages.entries()) {
    const problem = stageFieldProblem(stage, index);
    if (problem !== null) return problem;
  }
  return validatePipeline(specOfStages(stages), teamCount);
}

/**
 * ADR-325 — a way of sourcing a stage's teams, as the select offers it. An option the stage cannot
 * take is shown disabled with its reason rather than hidden, so the person sees that it exists and
 * why it is not available HERE (the first stage has no earlier stage to take from).
 */
export interface SourceChoice {
  kind: StageDraft['sourceKind'];
  label: string;
  isEnabled: boolean;
  reason: string | null;
}

/** Every format can take either source; only position decides, since advancers need an earlier stage. */
export function sourceChoicesOf(index: number, stages: readonly StageDraft[]): SourceChoice[] {
  const hasEarlier = stages.slice(0, index).some((stage) => stage.code.trim() !== '');
  return [
    { kind: 'initial', label: 'The entered teams, in seed order', isEnabled: true, reason: null },
    {
      kind: 'advancers',
      label: 'The best finishers of an earlier stage',
      isEnabled: hasEarlier,
      reason: hasEarlier ? null : 'There is no earlier stage to take teams from.',
    },
  ];
}

/** The format list as the form offers it: id, label, one-line summary, the team range. */
export const FORMAT_CHOICES = FORMATS.map((format) => ({
  id: format.id,
  label: format.label,
  summary: format.summary,
  minTeams: format.minTeams,
  maxTeams: format.maxTeams,
}));

const THIRD_PLACE_FORMATS: readonly TournamentFormatId[] = ['groups_knockout', 'single_elimination', 'points_rush'];

function wholeNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) ? value : undefined;
}

/** The options the chosen format reads; the rest are left out rather than sent as noise. */
export function optionsOf(draft: SetupDraft): desk.FormatOptionsBody {
  const groupSize = draft.formatId === 'groups_knockout' ? wholeNumber(draft.groupSize) : undefined;
  const advanceCount = draft.formatId === 'groups_knockout' ? wholeNumber(draft.advanceCount) : undefined;
  const rounds = draft.formatId === 'swiss' ? wholeNumber(draft.rounds) : undefined;
  return {
    ...(groupSize === undefined ? {} : { groupSize }),
    ...(advanceCount === undefined ? {} : { advanceCount }),
    ...(THIRD_PLACE_FORMATS.includes(draft.formatId) ? { hasThirdPlace: draft.hasThirdPlace } : {}),
    ...(rounds === undefined ? {} : { rounds }),
  };
}

function numberText(value: number | undefined, fallback: string): string {
  return value === undefined ? fallback : String(value);
}

/**
 * ADR-313 — a tournament read back as the setup form's text. A draft with a saved Start
 * configuration opens with that configuration in the fields; a draft without one opens with
 * the tournament's own name, rates and entrants over the form's defaults. Nothing here starts
 * anything: the saved answer is only finalised by the Start click it pre-fills.
 */
export function setupDraftFromTournament(tournament: AdminTournamentView | null): SetupDraft {
  if (tournament === null) return { ...INITIAL_SETUP, stages: templateStages() };
  const base: SetupDraft = {
    ...INITIAL_SETUP,
    name: tournament.name,
    kind: tournament.kind,
    dumbTiers:
      tournament.dumbTiers.length === 0
        ? INITIAL_SETUP.dumbTiers
        : tournament.dumbTiers.map((tier) => ({ label: tier.label, points: String(tier.points) })),
    winPoints: String(tournament.rates.win),
    drawPoints: String(tournament.rates.draw),
    lossPoints: String(tournament.rates.loss),
    teamIds: [...tournament.entrants].sort((a, b) => a.entryOrder - b.entryOrder).map((entrant) => entrant.teamId),
    stages: templateStages(),
  };
  const saved = tournament.draftSetup;
  if (saved === null) return base;
  return {
    ...base,
    formatId: saved.formatId ?? base.formatId,
    groupSize: numberText(saved.options.groupSize, base.groupSize),
    advanceCount: numberText(saved.options.advanceCount, base.advanceCount),
    hasThirdPlace: saved.options.hasThirdPlace ?? base.hasThirdPlace,
    rounds: numberText(saved.options.rounds, base.rounds),
    matchMinutes: String(saved.matchMinutes),
    changeoverMinutes: String(saved.changeoverMinutes),
    restMinutes: String(saved.restMinutes),
    deadline: saved.deadline ?? '',
    buildMode: saved.buildMode,
    stages: saved.pipeline === undefined ? base.stages : saved.pipeline.stages.map((stage) => stageDraftOf(stage)),
  };
}

/** ADR-313 — the setup form's current answer as the configuration a draft can save. */
function savedPipelineOfStages(stages: readonly StageDraft[]): NonNullable<TournamentDraftSetup['pipeline']> {
  return {
    stages: specOfStages(stages).stages.map((stage) => {
      // specOfStages builds an options object for every stage, even when all its fields are blank.
      const options = stage.options as StageOptions;
      return {
        code: stage.code,
        label: stage.label,
        format: stage.format,
        source: stage.source,
        matchMinutes: stage.matchMinutes,
        options: {
          ...(options.groupSize !== undefined ? { groupSize: options.groupSize } : {}),
          ...(options.groupCount !== undefined ? { groupCount: options.groupCount } : {}),
          ...(options.advanceCount !== undefined ? { advanceCount: options.advanceCount } : {}),
          ...(options.hasThirdPlace !== undefined ? { hasThirdPlace: options.hasThirdPlace } : {}),
          ...(options.rates != null ? { rates: options.rates } : {}),
          ...(options.tablePoints != null ? { tablePoints: options.tablePoints } : {}),
        },
      };
    }),
  };
}

export function draftSetupOfSetup(draft: SetupDraft): TournamentDraftSetup {
  const timing = {
    matchMinutes: Number(draft.matchMinutes),
    changeoverMinutes: Number(draft.changeoverMinutes),
    restMinutes: Number(draft.restMinutes),
    deadline: draft.deadline.trim() === '' ? null : draft.deadline.trim(),
  };
  if (draft.buildMode === 'pipeline') {
    return { buildMode: 'pipeline', options: optionsOf(draft), pipeline: savedPipelineOfStages(draft.stages), ...timing };
  }
  return { buildMode: 'format', formatId: draft.formatId, options: optionsOf(draft), ...timing };
}

function timingTextProblem(draft: SetupDraft): string | null {
  const fields: readonly (readonly [string, number, number])[] = [
    [draft.matchMinutes, 1, 180],
    [draft.changeoverMinutes, 0, 60],
    [draft.restMinutes, 0, 120],
  ];
  for (const [text, min, max] of fields) {
    const value = Number(text);
    if (text.trim() === '' || !Number.isInteger(value) || value < min || value > max) return 'The timing is not ready to save.';
  }
  if (draft.deadline.trim() !== '' && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(draft.deadline.trim())) {
    return 'The hard stop is not ready to save.';
  }
  return null;
}

/** Why the form's current Start answer cannot be saved with a draft, or null when it can. */
function savedSetupProblem(draft: SetupDraft): string | null {
  return timingTextProblem(draft) ?? (draft.buildMode === 'pipeline' ? pipelineProblem(draft.stages, draft.teamIds.length) : formatProblem(draft, draft.teamIds.length));
}

/** Today at the given `HH:MM`, as an instant — or null for no deadline. */
export function deadlineOf(time: string, today: Date): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (match === null) return null;
  const at = new Date(today);
  at.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return at.toISOString();
}

/** The engine's own refusal for this many teams and these options, or null when the day can be played. */
export function formatProblem(draft: SetupDraft, teamCount: number = draft.teamIds.length): string | null {
  const format = findFormat(draft.formatId);
  return format === null ? 'Unknown format.' : format.validate(teamCount, optionsOf(draft));
}

// ADR-321 — dumb Start carries the timing fields the wire requires and ignores them: nothing is scheduled.
export function dumbActivateBody(draft: SetupDraft) {
  return {
    dumb: true,
    matchMinutes: Number(draft.matchMinutes) || 12,
    changeoverMinutes: Number(draft.changeoverMinutes) || 3,
    restMinutes: Number(draft.restMinutes) || 5,
  };
}

/** What stops Start, in the form's own words — dumb courts only ever lack a tier. */
export function setupStartProblem(draft: SetupDraft, entrantCount: number): string | null {
  if (draft.kind === 'dumb_courts') {
    return draft.dumbTiers.some((tier) => tier.label.trim() !== '') ? null : 'Add at least one award tier.';
  }
  return draft.buildMode === 'pipeline' ? pipelineProblem(draft.stages, entrantCount) : formatProblem(draft, entrantCount);
}

export interface SetupInput {
  desk: TournamentDesk;
  teams: readonly AdminTeamChoiceView[];
  /** The draft's entrants, once there is a draft: what Start will build the format over. */
  entrantCount: number;
  /** ADR-313 — the desk's tournament, when there is one: a draft's saved setup pre-fills Start. */
  tournament?: AdminTournamentView | null;
}

export function useTournamentSetup(input: SetupInput) {
  const { perform } = input.desk;
  const tournament = input.tournament ?? null;
  const [draft, setDraft] = useState<SetupDraft>(() => setupDraftFromTournament(tournament));
  useSavedDraftHydration(tournament, setDraft);
  const update = useCallback((patch: Partial<SetupDraft>) => setDraft((current) => ({ ...current, ...patch })), []);

  const toggleTeam = useCallback((teamId: string) => {
    setDraft((current) => {
      const isPicked = current.teamIds.includes(teamId);
      return { ...current, teamIds: isPicked ? current.teamIds.filter((id) => id !== teamId) : [...current.teamIds, teamId] };
    });
  }, []);

  const pickAll = useCallback(() => update({ teamIds: input.teams.map((team) => team.id) }), [input.teams, update]);

  const createDraft = useCallback(() => {
    const body: desk.DraftBody = {
      name: draft.name.trim(),
      kind: draft.kind,
      winPoints: Number(draft.winPoints),
      drawPoints: Number(draft.drawPoints),
      lossPoints: Number(draft.lossPoints),
      teamIds: draft.teamIds,
      // ADR-313 — save the Start answer with the draft when it describes a playable day. An
      // answer the field cannot play is not the desk's intent yet (the draft form shows none of
      // those fields), so it must not stop the draft itself being made.
      ...(draft.kind !== 'dumb_courts' && savedSetupProblem(draft) === null ? { setup: draftSetupOfSetup(draft) } : {}),
      // ADR-321 — dumb courts save their tiers instead of a Start answer: there is nothing to schedule.
      ...(draft.kind === 'dumb_courts'
        ? { tiers: draft.dumbTiers.filter((tier) => tier.label.trim() !== '').map((tier) => ({ label: tier.label.trim(), points: Number(tier.points) || 1 })) }
        : {}),
    };
    return perform(() => desk.createDraft(body));
  }, [draft, perform]);

  const start = useCallback(() => {
    const timing = {
      matchMinutes: Number(draft.matchMinutes),
      changeoverMinutes: Number(draft.changeoverMinutes),
      restMinutes: Number(draft.restMinutes),
      deadlineAt: deadlineOf(draft.deadline, new Date()),
    };
    const body: desk.ActivateBody =
      draft.kind === 'dumb_courts'
        ? { ...dumbActivateBody(draft), deadlineAt: null }
        : draft.buildMode === 'pipeline'
          ? { pipeline: specOfStages(draft.stages), ...timing }
          : { formatId: draft.formatId, options: optionsOf(draft), ...timing };
    return perform(() => desk.activateTournament(body));
  }, [draft, perform]);

  const stageOps = useStageOps(setDraft);

  const discard = useCallback(() => perform(() => desk.discardDraft()), [perform]);
  const startProblem = useMemo(() => setupStartProblem(draft, input.entrantCount), [draft, input.entrantCount]);
  return { draft, update, toggleTeam, pickAll, createDraft, start, discard, startProblem, ...stageOps };
}

/**
 * ADR-313 — one hydration per draft: the saved setup pre-fills Start when a draft first
 * appears, and a later console refresh never overwrites what the desk is typing.
 */
function useSavedDraftHydration(tournament: AdminTournamentView | null, setDraft: (draft: SetupDraft) => void): void {
  const hydratedTournamentId = useRef<string | null>(tournament?.status === 'draft' ? tournament.id : null);
  useEffect(() => {
    if (tournament === null || tournament.status !== 'draft' || hydratedTournamentId.current === tournament.id) return;
    hydratedTournamentId.current = tournament.id;
    setDraft(setupDraftFromTournament(tournament));
  }, [tournament, setDraft]);
}

/** The stage list's edits, as callbacks over the draft's one setter. */
function useStageOps(setDraft: (updater: (current: SetupDraft) => SetupDraft) => void) {
  const updateStage = useCallback(
    (index: number, patch: Partial<StageDraft>) => setDraft((current) => ({ ...current, stages: patchStage(current.stages, index, patch) })),
    [setDraft],
  );
  const addStage = useCallback(
    () => setDraft((current) => ({ ...current, stages: [...current.stages, blankStage(current.stages.length)] })),
    [setDraft],
  );
  const removeStage = useCallback((index: number) => setDraft((current) => ({ ...current, stages: withoutStage(current.stages, index) })), [setDraft]);
  const moveStage = useCallback(
    (index: number, direction: -1 | 1) => setDraft((current) => ({ ...current, stages: movedStage(current.stages, index, direction) })),
    [setDraft],
  );
  const resetStages = useCallback(() => setDraft((current) => ({ ...current, stages: templateStages() })), [setDraft]);
  return { updateStage, addStage, removeStage, moveStage, resetStages };
}

export type TournamentSetup = ReturnType<typeof useTournamentSetup>;
