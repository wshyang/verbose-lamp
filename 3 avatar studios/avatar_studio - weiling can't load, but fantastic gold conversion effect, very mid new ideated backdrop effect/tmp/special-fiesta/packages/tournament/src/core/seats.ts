import { advancersRanked, groupStandings, isGroupDecided, stageStandings } from './standings.js';
import type { Match, Side, Slot, SlotSource, TournamentState } from './types.js';

/**
 * ADR-273 — who sits in a seat.
 *
 * `resolveSource` answers "who WOULD sit here, from the results so far" and is a forecast until the
 * seat is frozen: a seat is frozen into `seatedEntrantId` when its match starts or when a stage
 * completion seats it. A frozen seat is the answer from then on, whatever later corrections do to the
 * table it came from — corrections move tables, not people (P-09, P-11). Only `reseat` moves one.
 */

export function otherSide(side: Side): Side {
  return side === 'a' ? 'b' : 'a';
}

function findMatch(state: TournamentState, matchId: string): Match | undefined {
  return state.matches.find((match) => match.id === matchId);
}

/** The side that won a finished, unvoided match; null for a draw, an unfinished match or a void. */
export function winningSide(match: Match): Side | null {
  if (match.status !== 'completed' || match.isVoided || match.result === null) return null;
  return match.result.winnerSide;
}

function fromOutcome(state: TournamentState, input: { matchId: string; wantWinner: boolean }): string | null {
  const match = findMatch(state, input.matchId);
  if (match === undefined) return null;
  const winner = winningSide(match);
  if (winner === null) return null;
  const side = input.wantWinner ? winner : otherSide(winner);
  return currentOccupant(state, { match, side });
}

function fromGroupPlace(state: TournamentState, source: { groupId: string; place: number }): string | null {
  const group = state.groups.find((candidate) => candidate.id === source.groupId);
  if (group === undefined || !isGroupDecided(state, group)) return null;
  return groupStandings(state, group)[source.place - 1]?.entrantId ?? null;
}

function isStageFinished(state: TournamentState, stageId: string): boolean {
  return !state.matches.some(
    (match) => match.stageId === stageId && (match.status === 'scheduled' || match.status === 'in_progress'),
  );
}

function fromStagePlace(state: TournamentState, source: { stageId: string; place: number }): string | null {
  const stage = state.stages.find((candidate) => candidate.id === source.stageId);
  if (stage === undefined || !isStageFinished(state, stage.id)) return null;
  // ADR-310 — a stage with groups ranks its advancers (winners first, then the best
  // runners-up: advancersRanked); one without ranks everybody (Swiss). For a stage
  // that advances only its winners the two readings agree on the places that exist.
  const hasGroups = state.groups.some((group) => group.stageId === stage.id);
  const table = hasGroups ? advancersRanked(state, stage) : stageStandings(state, stage);
  return table[source.place - 1]?.entrantId ?? null;
}

/** Who a source names right now. Pairing and vacant seats name nobody until a person or a round fills them. */
export function resolveSource(state: TournamentState, source: SlotSource): string | null {
  switch (source.kind) {
    case 'entrant':
      return source.entrantId;
    case 'winner_of':
      return fromOutcome(state, { matchId: source.matchId, wantWinner: true });
    case 'loser_of':
      return fromOutcome(state, { matchId: source.matchId, wantWinner: false });
    case 'group_place':
      return fromGroupPlace(state, source);
    case 'stage_place':
      return fromStagePlace(state, source);
    case 'pairing':
    case 'vacant':
      return null;
  }
}

/** The seat's frozen occupant if it has one, else the forecast. */
export function currentOccupant(state: TournamentState, input: { match: Match; side: Side }): string | null {
  const slot = input.match.slots[input.side];
  return slot.seatedEntrantId ?? resolveSource(state, slot.source);
}

/** A copy of the slot with its seat frozen to whoever the source names now (unchanged if frozen). */
export function freezeSlot(state: TournamentState, slot: Slot): Slot {
  if (slot.seatedEntrantId !== null) return slot;
  const occupant = resolveSource(state, slot.source);
  return occupant === null ? slot : { ...slot, seatedEntrantId: occupant };
}

/** Both seats of a match as they would be filled now. */
export function occupantsOf(state: TournamentState, match: Match): { a: string | null; b: string | null } {
  return {
    a: currentOccupant(state, { match, side: 'a' }),
    b: currentOccupant(state, { match, side: 'b' }),
  };
}

function sourceDependencies(state: TournamentState, source: SlotSource): string[] {
  if (source.kind === 'winner_of' || source.kind === 'loser_of') return [source.matchId];
  if (source.kind === 'group_place') {
    return state.matches.filter((other) => other.groupId === source.groupId).map((other) => other.id);
  }
  if (source.kind === 'stage_place') {
    return state.matches.filter((other) => other.stageId === source.stageId).map((other) => other.id);
  }
  return [];
}

/** The match ids a match waits on — the dependency edges of the structure DAG. Frozen seats wait on nothing. */
export function dependenciesOf(state: TournamentState, match: Match): string[] {
  const ids = (['a', 'b'] as const).flatMap((side) => {
    const slot = match.slots[side];
    return slot.seatedEntrantId === null ? sourceDependencies(state, slot.source) : [];
  });
  return [...new Set(ids)].filter((id) => id !== match.id);
}

/** True when the dependency edges never loop back — a structure that can actually be played. */
export function isAcyclic(state: TournamentState): boolean {
  const done = new Set<string>();
  const open = new Set<string>();
  const byId = new Map(state.matches.map((match) => [match.id, match]));
  const visit = (id: string): boolean => {
    if (done.has(id)) return true;
    if (open.has(id)) return false;
    open.add(id);
    const match = byId.get(id);
    const ok = match === undefined || dependenciesOf(state, match).every(visit);
    open.delete(id);
    done.add(id);
    return ok;
  };
  return state.matches.every((match) => visit(match.id));
}
