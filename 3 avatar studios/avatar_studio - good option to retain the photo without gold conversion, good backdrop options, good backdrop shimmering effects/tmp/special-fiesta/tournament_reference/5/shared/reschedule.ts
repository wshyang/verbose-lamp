import type { MatchView, ScheduleConfig } from './types.js';
import { isByeSlot } from './slots.js';

export interface RescheduledSlot {
  matchId: string;
  courtNumber: number | null;
  startMinutes: number | null;
  endMinutes: number | null;
}

function blockCourts(locked: MatchView[], courtFree: number[]): void {
  for (const match of locked) {
    if (match.courtName === null || match.startMinutes === null || match.endMinutes === null) continue;
    const index = Number(match.courtName.replace('Court ', '')) - 1;
    if (index >= 0 && index < courtFree.length) {
      courtFree[index] = Math.max(courtFree[index], match.endMinutes);
    }
  }
}

/**
 * Wet-weather contingency (P-14): re-time only matches that have not started.
 * Live/final/cancelled matches are history and act as court blockers plus
 * dependency end-times. Scheduled matches keep their relative order.
 */
export function rescheduleFutureMatches(matches: MatchView[], config: ScheduleConfig): RescheduledSlot[] {
  const locked = matches.filter((match) => match.status !== 'scheduled');
  const future = matches
    .filter((match) => match.status === 'scheduled')
    .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0) || a.key.localeCompare(b.key));
  const courtFree = Array.from({ length: config.courts }, () => config.startMinutes);
  blockCourts(locked, courtFree);
  const endByKey = new Map<string, number>();
  for (const match of locked) {
    if (match.endMinutes !== null) endByKey.set(match.key, match.endMinutes);
  }
  const teamFree = new Map<string, number>();
  const results: RescheduledSlot[] = [];
  for (const match of future) results.push(placeMatch(match, { courtFree, endByKey, teamFree }, config));
  return results;
}

function placeMatch(
  match: MatchView,
  state: { courtFree: number[]; endByKey: Map<string, number>; teamFree: Map<string, number> },
  config: ScheduleConfig,
): RescheduledSlot {
  if (isByeSlot(match.slotA) || isByeSlot(match.slotB)) {
    state.endByKey.set(match.key, config.startMinutes);
    return { matchId: match.id, courtNumber: null, startMinutes: null, endMinutes: null };
  }
  let ready = config.startMinutes;
  for (const key of match.dependsOn) {
    const end = state.endByKey.get(key);
    if (end !== undefined) ready = Math.max(ready, end + config.restMinutes);
  }
  for (const slot of [match.slotA, match.slotB]) {
    if (slot.kind === 'team') ready = Math.max(ready, state.teamFree.get(slot.teamRef) ?? config.startMinutes);
  }
  let courtIndex = 0;
  let start = Math.max(state.courtFree[0], ready);
  for (let index = 1; index < state.courtFree.length; index += 1) {
    const candidate = Math.max(state.courtFree[index], ready);
    if (candidate < start) { start = candidate; courtIndex = index; }
  }
  const end = start + config.matchLengthMinutes;
  state.courtFree[courtIndex] = end;
  state.endByKey.set(match.key, end);
  for (const slot of [match.slotA, match.slotB]) {
    if (slot.kind === 'team') state.teamFree.set(slot.teamRef, end + config.restMinutes);
  }
  return { matchId: match.id, courtNumber: courtIndex + 1, startMinutes: start, endMinutes: end };
}
