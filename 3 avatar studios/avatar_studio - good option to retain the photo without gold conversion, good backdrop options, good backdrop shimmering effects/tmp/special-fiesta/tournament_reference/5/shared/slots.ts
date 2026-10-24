import type { SlotSource } from './types.js';

export function teamSlot(teamRef: string, label: string): SlotSource {
  return { kind: 'team', teamRef, label };
}

export function seedSlot(seed: number): SlotSource {
  return teamSlot(`team-${seed}`, `Seed ${seed}`);
}

export function winnerOf(matchKey: string): SlotSource {
  return { kind: 'winnerOf', matchKey };
}

export function loserOf(matchKey: string): SlotSource {
  return { kind: 'loserOf', matchKey };
}

export function rankOf(scope: string, rank: number): SlotSource {
  return { kind: 'rankOf', scope, rank };
}

export function recordPool(round: number, label: string): SlotSource {
  return { kind: 'recordPool', round, label };
}

export function byeSlot(): SlotSource {
  return { kind: 'bye' };
}

export function slotLabel(slot: SlotSource): string {
  if (slot.kind === 'team') return slot.label;
  if (slot.kind === 'winnerOf') return `Winner of ${slot.matchKey}`;
  if (slot.kind === 'loserOf') return `Loser of ${slot.matchKey}`;
  if (slot.kind === 'rankOf') return `#${slot.rank} ${slot.scope}`;
  if (slot.kind === 'recordPool') return slot.label;
  return 'BYE';
}

export function slotMatchKey(slot: SlotSource): string | null {
  if (slot.kind === 'winnerOf' || slot.kind === 'loserOf') return slot.matchKey;
  return null;
}

export function isByeSlot(slot: SlotSource): boolean {
  return slot.kind === 'bye';
}
