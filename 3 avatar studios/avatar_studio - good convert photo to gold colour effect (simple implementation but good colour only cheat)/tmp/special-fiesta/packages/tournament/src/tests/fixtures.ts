import type {
  Actor,
  CommandContext,
  CommandResult,
  Entrant,
  Match,
  Slot,
  SlotSource,
  Stage,
  TournamentState,
} from '../core/types.js';

/** Deterministic fixtures: named teams, fixed ids, fixed clock. No randomness anywhere. */

export const NOW = '2026-10-15T02:00:00.000Z';
export const DESK: Actor = { kind: 'superadmin', id: 'sa-1', label: 'desk' };
export const MARSHAL: Actor = { kind: 'facilitator', id: 'fa-1', label: 'court1' };
export const OTHER_MARSHAL: Actor = { kind: 'facilitator', id: 'fa-2', label: 'court2' };
export const SYSTEM: Actor = { kind: 'system', id: 'sys', label: 'system' };

export const TEAM_NAMES = ['Reds', 'Blues', 'Greens', 'Golds', 'Teals', 'Pinks', 'Greys', 'Limes'];

export function entrants(count: number): Entrant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    name: TEAM_NAMES[index] ?? `Team ${index + 1}`,
    entryOrder: index + 1,
    withdrawnAt: null,
  }));
}

export function stage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: 's1',
    ordinal: 1,
    label: 'Pool',
    kind: 'pool',
    allowsDraws: true,
    advanceCount: 2,
    rates: null,
    tablePoints: null,
    intake: null,
    roster: [],
    status: 'active',
    ...overrides,
  };
}

export function slotOf(source: SlotSource, label = 'TBD'): Slot {
  return { source, label, seatedEntrantId: null, seatOverrideReason: null };
}

export function entrantSlot(entrantId: string): Slot {
  return slotOf({ kind: 'entrant', entrantId }, entrantId);
}

export function match(overrides: Partial<Match> & { id: string }): Match {
  return {
    code: overrides.id.toUpperCase(),
    stageId: 's1',
    groupId: null,
    round: 1,
    sequence: 1,
    origin: 'structure',
    isPlacement: false,
    status: 'scheduled',
    courtId: null,
    plannedStartAt: null,
    plannedMinutes: 12,
    startedAt: null,
    endedAt: null,
    startedBy: null,
    scoreA: 0,
    scoreB: 0,
    result: null,
    isVoided: false,
    cancelReason: null,
    version: 0,
    slots: { a: entrantSlot('e1'), b: entrantSlot('e2') },
    ...overrides,
  };
}

export function state(overrides: Partial<TournamentState> = {}): TournamentState {
  return {
    tournament: { id: 't1', name: 'Day', status: 'live', kind: 'captains_ball' as const, rates: { win: 30, draw: 20, loss: 10 }, closeReason: null, pausedAt: null },
    entrants: entrants(4),
    stages: [stage()],
    groups: [],
    matches: [],
    awards: [],
    courts: [
      { id: 'c1', label: 'Court 1', isEnabled: true },
      { id: 'c2', label: 'Court 2', isEnabled: true },
    ],
    ...overrides,
  };
}

export function context(actor: Actor = MARSHAL, newIds: readonly string[] = ['n1', 'n2', 'n3', 'n4']): CommandContext {
  return { now: NOW, actor, newIds };
}

/** Unwraps a successful command, failing the test loudly with the refusal otherwise. */
export function ok(result: CommandResult): Extract<CommandResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected success, got ${result.refusal.code}: ${result.refusal.message}`);
  return result;
}

export function refusalCode(result: CommandResult): string | null {
  return result.ok ? null : result.refusal.code;
}

export function matchIn(value: TournamentState, id: string): Match {
  const found = value.matches.find((row) => row.id === id);
  if (found === undefined) throw new Error(`no match ${id}`);
  return found;
}
