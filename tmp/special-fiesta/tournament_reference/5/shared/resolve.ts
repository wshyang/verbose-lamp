import type { MatchStatus, SlotSource } from './types.js';

export interface ResolvableMatch {
  key: string;
  slotA: SlotSource;
  slotB: SlotSource;
  status: MatchStatus;
  scoreA: number | null;
  scoreB: number | null;
}

export function resolveSlotTeam(slot: SlotSource, byKey: Map<string, ResolvableMatch>): string | null {
  if (slot.kind === 'team') return slot.teamRef;
  if (slot.kind !== 'winnerOf' && slot.kind !== 'loserOf') return null;
  const match = byKey.get(slot.matchKey);
  if (match === undefined || match.status !== 'final') return null;
  if (match.scoreA === null || match.scoreB === null || match.scoreA === match.scoreB) return null;
  const teamA = resolveSlotTeam(match.slotA, byKey);
  const teamB = resolveSlotTeam(match.slotB, byKey);
  if (teamA === null || teamB === null) return null;
  const winner = match.scoreA > match.scoreB ? teamA : teamB;
  const loser = match.scoreA > match.scoreB ? teamB : teamA;
  return slot.kind === 'winnerOf' ? winner : loser;
}

export function indexMatches<T extends ResolvableMatch>(matches: T[]): Map<string, T> {
  return new Map(matches.map((match) => [match.key, match]));
}
