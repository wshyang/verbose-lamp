import { eq } from 'drizzle-orm';
import type { Actor, Match, PointRates, Refusal, Slot, SlotSource, StageFragment, TournamentState } from '@psd/tournament/core';
import { restructureStages } from '@psd/tournament/core';
import type { DraftMatch, DraftSource, FormatOptions, PipelineSpec, StageSpec, Structure } from '@psd/tournament/scheduler';
import { buildPipeline, findFormat, validatePipeline } from '@psd/tournament/scheduler';
import type { AppDatabase } from '../db/client.js';
import { newId } from '../db/ids.js';
import { tournamentEntrants, tournamentSchedulers, tournamentStages } from '../db/schema/index.js';
import { schedulerDay } from '../tournament/dayPolicy.js';
import { loadState } from '../tournament/load.js';
import { runCommand } from '../tournament/commands.js';

/**
 * ADR-334 (ADR-329 F12) — rebuilding an unstarted stage on the day. The scheduler owns the
 * format knowledge: it patches the stored plan, revalidates it, rebuilds the structure, and
 * hands the core a format-blind fragment. Fragment stages are the target plus every stage
 * whose fixtures read the target's groups, because those fixtures must be re-pointed at the
 * new groups in the same command. Match ids are reused by code so pins and history survive;
 * groups always get new ids, and the replaced ones are superseded, never deleted.
 */

export interface RestagePatch {
  groupSize?: number | undefined;
  advanceCount?: number | undefined;
  hasThirdPlace?: boolean | undefined;
  intakeCount?: number | undefined;
  matchMinutes?: number | undefined;
  tablePoints?: PointRates | null | undefined;
  reason: string;
}

export type RestageOutcome = { ok: true } | { ok: false; error: string } | { ok: false; refusal: Refusal };

async function seededEntrants(db: AppDatabase, tournamentId: string) {
  const rows = await db.select().from(tournamentEntrants).where(eq(tournamentEntrants.tournamentId, tournamentId));
  return [...rows]
    .filter((row) => row.withdrawnAt === null)
    .sort((left, right) => left.entryOrder - right.entryOrder)
    .map((row, index) => ({ id: row.id, name: row.nameSnapshot, seed: index + 1 }));
}

function patchedSpec(spec: PipelineSpec, code: string, patch: RestagePatch): PipelineSpec | { error: string } {
  if (!spec.stages.some((stage) => stage.code === code)) return { error: 'That stage is not in the stored plan.' };
  return {
    stages: spec.stages.map((stage) => {
      if (stage.code !== code) return stage;
      const options = { ...stage.options };
      if (patch.groupSize !== undefined) options.groupSize = patch.groupSize;
      if (patch.advanceCount !== undefined) options.advanceCount = patch.advanceCount;
      if (patch.hasThirdPlace !== undefined) options.hasThirdPlace = patch.hasThirdPlace;
      let source = stage.source;
      if (patch.intakeCount !== undefined) {
        if (source.kind !== 'advancers') return { error: 'That stage takes the entered teams; it has no intake to change.' } as never;
        source = { ...source, count: patch.intakeCount };
      }
      const next: StageSpec = {
        ...stage,
        source,
        options,
        matchMinutes: patch.matchMinutes !== undefined ? patch.matchMinutes : stage.matchMinutes,
      };
      if (patch.tablePoints !== undefined) {
        if (next.options !== undefined) next.options.tablePoints = patch.tablePoints;
      }
      return next;
    }),
  };
}

interface BuildResult {
  structure: Structure;
  spec: PipelineSpec | null;
  /** A single-format restage's explicit stage length (a pipeline carries it in the spec). */
  minutes?: number | undefined;
}

async function buildPatched(input: {
  db: AppDatabase;
  row: typeof tournamentSchedulers.$inferSelect;
  code: string;
  patch: RestagePatch;
}): Promise<BuildResult | { error: string }> {
  const seeded = await seededEntrants(input.db, input.row.tournamentId);
  if (input.row.format === 'pipeline') {
    const stored = input.row.pipelineSpec as PipelineSpec | null;
    if (stored === null) return { error: 'This tournament started before stage plans were kept, so its stages cannot be rebuilt.' };
    const spec = patchedSpec(stored, input.code, input.patch);
    if ('error' in spec) return spec;
    const invalid = validatePipeline(spec, seeded.length);
    if (invalid !== null) return { error: invalid };
    return { structure: buildPipeline(spec, seeded), spec };
  }
  const format = findFormat(input.row.format);
  if (format === null) return { error: 'Unknown format.' };
  const options: FormatOptions = { ...(input.row.options as FormatOptions) };
  if (input.patch.groupSize !== undefined) options.groupSize = input.patch.groupSize;
  if (input.patch.advanceCount !== undefined) options.advanceCount = input.patch.advanceCount;
  if (input.patch.hasThirdPlace !== undefined) options.hasThirdPlace = input.patch.hasThirdPlace;
  const invalid = format.validate(seeded.length, options);
  if (invalid !== null) return { error: invalid };
  return { structure: format.build(seeded, options), spec: null, minutes: input.patch.matchMinutes };
}

interface IdMaps {
  stages: Map<string, string>;
  groups: Map<string, string>;
  matches: Map<string, string>;
}

function required(map: ReadonlyMap<string, string>, key: string): string {
  const value = map.get(key);
  if (value === undefined) throw new Error(`structure refers to unknown code ${key}`);
  return value;
}

function slotSourceOf(source: DraftSource, ids: IdMaps): SlotSource {
  switch (source.kind) {
    case 'entrant':
      return { kind: 'entrant', entrantId: source.entrantId };
    case 'winner_of':
      return { kind: 'winner_of', matchId: required(ids.matches, source.code) };
    case 'loser_of':
      return { kind: 'loser_of', matchId: required(ids.matches, source.code) };
    case 'group_place':
      return { kind: 'group_place', groupId: required(ids.groups, source.groupCode), place: source.place };
    case 'stage_place':
      return { kind: 'stage_place', stageId: required(ids.stages, source.stageCode), place: source.place };
    case 'pairing':
      return { kind: 'pairing', stageId: required(ids.stages, source.stageCode), round: source.round, pairIndex: source.pairIndex, side: source.side };
    case 'vacant':
      return { kind: 'vacant' };
  }
}

function matchOf(draft: DraftMatch, input: { ids: IdMaps; minutes: number }): Match {
  const slot = (seat: DraftMatch['a']): Slot => ({
    source: slotSourceOf(seat.source, input.ids),
    label: seat.label.slice(0, 60),
    seatedEntrantId: null,
    seatOverrideReason: null,
  });
  return {
    id: input.ids.matches.get(draft.code) ?? newId(),
    code: draft.code,
    stageId: required(input.ids.stages, draft.stageCode),
    groupId: draft.groupCode === null ? null : (input.ids.groups.get(draft.groupCode) ?? null),
    round: draft.round,
    sequence: draft.sequence,
    origin: 'structure',
    isPlacement: draft.isPlacement,
    status: 'scheduled',
    courtId: null,
    plannedStartAt: null,
    plannedMinutes: input.minutes,
    startedAt: null,
    endedAt: null,
    startedBy: null,
    scoreA: 0,
    scoreB: 0,
    result: null,
    isVoided: false,
    cancelReason: null,
    version: 0,
    slots: { a: slot(draft.a), b: slot(draft.b) },
  };
}


/** The stages a rebuild must cover: the target, plus any stage whose fixtures read the target's groups. */
function fragmentCodesOf(before: TournamentState, input: { stageId: string; targetCode: string; codeByStageId: Map<string, string> }): Set<string> {
  const targetGroupIds = new Set(before.groups.filter((group) => group.stageId === input.stageId).map((group) => group.id));
  const codes = new Set([input.targetCode]);
  for (const match of before.matches) {
    const reads = (['a', 'b'] as const).some((side) => {
      const source = match.slots[side].source;
      return source.kind === 'group_place' && targetGroupIds.has(source.groupId);
    });
    const code = reads ? input.codeByStageId.get(match.stageId) : undefined;
    if (code !== undefined) codes.add(code);
  }
  return codes;
}

function buildFragments(input: {
  structure: Structure;
  before: TournamentState;
  codes: Set<string>;
  stageIdByCode: Map<string, string>;
  matchMinutes: number;
}): StageFragment[] {
  const { structure, before } = input;
  const groupIds = new Map<string, string>();
  for (const group of structure.groups) {
    const existing = before.groups.find((row) => row.code === group.code && row.stageId === input.stageIdByCode.get(group.stageCode));
    groupIds.set(group.code, input.codes.has(group.stageCode) || existing === undefined ? newId() : existing.id);
  }
  const matchIds = new Map<string, string>();
  for (const match of structure.matches) {
    matchIds.set(match.code, before.matches.find((row) => row.code === match.code)?.id ?? newId());
  }
  const ids: IdMaps = { stages: input.stageIdByCode, groups: groupIds, matches: matchIds };
  const fragments: StageFragment[] = [];
  for (const code of input.codes) {
    const draftStage = structure.stages.find((stage) => stage.code === code);
    const stageId = input.stageIdByCode.get(code);
    if (draftStage === undefined || stageId === undefined) continue;
    fragments.push({
      stageId,
      patch: {
        advanceCount: draftStage.advanceCount,
        rates: draftStage.rates,
        tablePoints: draftStage.tablePoints,
        intake: draftStage.intake === null ? null : { fromStageId: required(input.stageIdByCode, draftStage.intake.fromStageCode), count: draftStage.intake.count },
        kind: draftStage.kind,
        allowsDraws: draftStage.allowsDraws,
      },
      groups: structure.groups
        .filter((group) => group.stageCode === code)
        .map((group) => ({ id: required(groupIds, group.code), stageId, code: group.code, label: group.label, entrantIds: [...group.entrantIds] })),
      matches: structure.matches
        .filter((match) => match.stageCode === code)
        .map((match) => matchOf(match, { ids, minutes: draftStage.matchMinutes ?? input.matchMinutes })),
    });
  }
  return fragments;
}

export async function restageStage(
  db: AppDatabase,
  input: { tournamentId: string; stageId: string; patch: RestagePatch; actor: Actor },
): Promise<RestageOutcome> {
  const [row] = await db.select().from(tournamentSchedulers).where(eq(tournamentSchedulers.tournamentId, input.tournamentId)).limit(1);
  if (row === undefined) return { ok: false, error: 'That tournament has no scheduler to rebuild its stages.' };
  const stageRows = await db.select().from(tournamentStages).where(eq(tournamentStages.tournamentId, input.tournamentId));
  const target = stageRows.find((stage) => stage.id === input.stageId);
  if (target === undefined) return { ok: false, error: 'No such stage.' };
  const built = await buildPatched({ db, row, code: target.code, patch: input.patch });
  if ('error' in built) return { ok: false, error: built.error };
  const tournamentRow = await schedulerDay(db);
  if (tournamentRow === null || tournamentRow.id !== input.tournamentId) return { ok: false, error: 'No such tournament.' };
  const before = await loadState(db, tournamentRow);
  const stageIdByCode = new Map(stageRows.map((stage) => [stage.code, stage.id]));
  const codes = fragmentCodesOf(before, {
    stageId: input.stageId,
    targetCode: target.code,
    codeByStageId: new Map(stageRows.map((stage) => [stage.id, stage.code])),
  });
  const fragments = buildFragments({ structure: built.structure, before, codes, stageIdByCode, matchMinutes: built.minutes ?? row.matchMinutes });
  const outcome = await runCommand(db, {
    actor: input.actor,
    now: new Date(),
    command: (state, context) =>
      state.tournament.id === input.tournamentId
        ? restructureStages(state, { fragments, reason: input.patch.reason }, context)
        : { ok: false as const, refusal: { code: 'not_found' as const, message: 'No such tournament.' } },
  });
  if (!outcome.ok) return { ok: false, refusal: outcome.refusal };
  if (built.spec !== null) {
    await db.update(tournamentSchedulers).set({ pipelineSpec: built.spec }).where(eq(tournamentSchedulers.tournamentId, input.tournamentId));
  }
  return { ok: true };
}
