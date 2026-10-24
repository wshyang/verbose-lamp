import type { FitConfig, MatchSpec, ScheduledMatch, ScheduleConfig, SimulationResult } from './types.js';
import { isByeSlot, slotMatchKey } from './slots.js';

interface CourtChoice { courtIndex: number; start: number }

function earliestCourt(courtFree: number[], readyAt: number): CourtChoice {
  let choice: CourtChoice = { courtIndex: 0, start: Math.max(courtFree[0], readyAt) };
  for (let index = 1; index < courtFree.length; index += 1) {
    const start = Math.max(courtFree[index], readyAt);
    if (start < choice.start) choice = { courtIndex: index, start };
  }
  return choice;
}

function readyAtFor(spec: MatchSpec, endByKey: Map<string, number>, config: ScheduleConfig): number {
  let ready = config.startMinutes;
  for (const key of spec.dependsOn) ready = Math.max(ready, (endByKey.get(key) as number) + config.restMinutes);
  return ready;
}

function scheduleOne(
  spec: MatchSpec,
  state: { courtFree: number[]; teamFree: Map<string, number>; endByKey: Map<string, number> },
  config: ScheduleConfig,
): ScheduledMatch {
  if (isByeSlot(spec.slotA) || isByeSlot(spec.slotB)) {
    state.endByKey.set(spec.key, config.startMinutes);
    return { ...spec, court: null, startMinutes: null, endMinutes: null, isBackToBack: false };
  }
  let ready = readyAtFor(spec, state.endByKey, config);
  for (const slot of [spec.slotA, spec.slotB]) {
    if (slot.kind === 'team') ready = Math.max(ready, state.teamFree.get(slot.teamRef) ?? config.startMinutes);
  }
  const choice = earliestCourt(state.courtFree, ready);
  const start = choice.start;
  const end = start + config.matchLengthMinutes;
  state.courtFree[choice.courtIndex] = end;
  state.endByKey.set(spec.key, end);
  for (const slot of [spec.slotA, spec.slotB]) {
    if (slot.kind === 'team') state.teamFree.set(slot.teamRef, end + config.restMinutes);
  }
  const feederEnds = spec.dependsOn.map((key) => state.endByKey.get(key)).filter((v) => v !== undefined);
  const latestFeederEnd = feederEnds.length > 0 ? Math.max(...feederEnds) : null;
  return {
    ...spec,
    court: choice.courtIndex + 1,
    startMinutes: start,
    endMinutes: end,
    isBackToBack: latestFeederEnd !== null && start === latestFeederEnd && config.restMinutes === 0,
  };
}

export function scheduleMatches(specs: MatchSpec[], config: ScheduleConfig): ScheduledMatch[] {
  const state = {
    courtFree: Array.from({ length: config.courts }, () => config.startMinutes),
    teamFree: new Map<string, number>(),
    endByKey: new Map<string, number>(),
  };
  const pending = [...specs];
  const done: ScheduledMatch[] = [];
  while (pending.length > 0) {
    const index = pending.findIndex((spec) => spec.dependsOn.every((key) => state.endByKey.has(key)));
    if (index === -1) throw new Error('Unschedulable match graph: unresolved dependencies');
    const [spec] = pending.splice(index, 1);
    done.push(scheduleOne(spec, state, config));
  }
  return done;
}

export function simulate(specs: MatchSpec[], config: FitConfig): SimulationResult {
  const matches = scheduleMatches(specs, config);
  const playable = matches.filter((match) => match.court !== null);
  const finishMinutes = playable.length > 0
    ? Math.max(...playable.map((match) => match.endMinutes as number))
    : config.startMinutes;
  const totalMinutes = finishMinutes - config.startMinutes;
  return {
    matches,
    totalMinutes,
    finishMinutes,
    playableMatches: playable.length,
    courtMinutes: playable.length * config.matchLengthMinutes,
    fitsInTournamentLength: totalMinutes <= config.tournamentLengthMinutes,
    overrunMinutes: Math.max(0, totalMinutes - config.tournamentLengthMinutes),
  };
}

export function dependenciesOf(spec: MatchSpec): string[] {
  const keys = new Set(spec.dependsOn);
  for (const slot of [spec.slotA, spec.slotB]) {
    const key = slotMatchKey(slot);
    if (key !== null) keys.add(key);
  }
  return [...keys];
}
