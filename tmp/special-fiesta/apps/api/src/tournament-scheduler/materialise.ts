import type { Group, Match, Slot, SlotSource, Stage } from '@psd/tournament/core';
import type { DraftMatch, DraftSource, Structure } from '@psd/tournament/scheduler';
import { newId } from '../db/ids.js';
import type { NewStructure } from '../tournament/persist.js';

/**
 * ADR-274/275 — a format's structure, given ids. Drafts point at each other by code; this mints one
 * UUIDv7 per stage, group and match (through `db/ids.ts`, the only minter) and rewrites every code
 * reference to the id it now names.
 */

interface IdMaps {
  stages: Map<string, string>;
  groups: Map<string, string>;
  matches: Map<string, string>;
  entrants: ReadonlyMap<string, string>;
}

function required(map: ReadonlyMap<string, string>, key: string): string {
  const value = map.get(key);
  if (value === undefined) throw new Error(`structure refers to unknown code ${key}`);
  return value;
}

type SourceReader = (source: DraftSource, ids: IdMaps) => SlotSource;

const SOURCE_READERS: Record<DraftSource['kind'], SourceReader> = {
  entrant: (source, ids) => ({ kind: 'entrant', entrantId: required(ids.entrants, (source as { entrantId: string }).entrantId) }),
  winner_of: (source, ids) => ({ kind: 'winner_of', matchId: required(ids.matches, (source as { code: string }).code) }),
  loser_of: (source, ids) => ({ kind: 'loser_of', matchId: required(ids.matches, (source as { code: string }).code) }),
  group_place: (source, ids) => {
    const place = source as { groupCode: string; place: number };
    return { kind: 'group_place', groupId: required(ids.groups, place.groupCode), place: place.place };
  },
  stage_place: (source, ids) => {
    const place = source as { stageCode: string; place: number };
    return { kind: 'stage_place', stageId: required(ids.stages, place.stageCode), place: place.place };
  },
  pairing: (source, ids) => {
    const pairing = source as Extract<DraftSource, { kind: 'pairing' }>;
    return { kind: 'pairing', stageId: required(ids.stages, pairing.stageCode), round: pairing.round, pairIndex: pairing.pairIndex, side: pairing.side };
  },
  vacant: () => ({ kind: 'vacant' }),
};

function slotOf(seat: DraftMatch['a'], ids: IdMaps): Slot {
  return { source: SOURCE_READERS[seat.source.kind](seat.source, ids), label: seat.label.slice(0, 60), seatedEntrantId: null, seatOverrideReason: null };
}

function matchOf(draft: DraftMatch, input: { ids: IdMaps; minutes: number }): Match {
  return {
    id: required(input.ids.matches, draft.code),
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
    slots: { a: slotOf(draft.a, input.ids), b: slotOf(draft.b, input.ids) },
  };
}

export interface MaterialiseInput {
  structure: Structure;
  /** Draft entrant id (the format's seed id) → tournament entrant id. */
  entrants: ReadonlyMap<string, string>;
  matchMinutes: number;
}

/** Ids for everything, then every reference rewritten. Group codes are unique across a structure. */
export function materialise(input: MaterialiseInput): NewStructure {
  const ids: IdMaps = {
    stages: new Map(input.structure.stages.map((stage) => [stage.code, newId()])),
    groups: new Map(input.structure.groups.map((group) => [group.code, newId()])),
    matches: new Map(input.structure.matches.map((match) => [match.code, newId()])),
    entrants: input.entrants,
  };
  const stages: (Stage & { code: string })[] = input.structure.stages.map((stage, index) => ({
    id: required(ids.stages, stage.code),
    code: stage.code,
    ordinal: stage.ordinal,
    label: stage.label,
    kind: stage.kind,
    allowsDraws: stage.allowsDraws,
    advanceCount: stage.advanceCount,
    rates: stage.rates,
    tablePoints: stage.tablePoints,
    intake:
      stage.intake === null ? null : { fromStageId: required(ids.stages, stage.intake.fromStageCode), count: stage.intake.count },
    roster: [],
    status: index === 0 ? 'active' : 'pending',
  }));
  const groups: Group[] = input.structure.groups.map((group) => ({
    id: required(ids.groups, group.code),
    stageId: required(ids.stages, group.stageCode),
    code: group.code,
    label: group.label,
    entrantIds: group.entrantIds.map((entrantId) => required(ids.entrants, entrantId)),
  }));
  // ADR-310 — a stage's own duration lands on its matches; everything else inherits
  // the tournament's. From activation on, `planned_minutes` is the record the
  // planner and the contingency rewrite both read.
  const stageMinutes = new Map(input.structure.stages.map((stage) => [stage.code, stage.matchMinutes]));
  return {
    stages,
    groups,
    matches: input.structure.matches.map((draft) =>
      matchOf(draft, { ids, minutes: stageMinutes.get(draft.stageCode) ?? input.matchMinutes }),
    ),
  };
}
