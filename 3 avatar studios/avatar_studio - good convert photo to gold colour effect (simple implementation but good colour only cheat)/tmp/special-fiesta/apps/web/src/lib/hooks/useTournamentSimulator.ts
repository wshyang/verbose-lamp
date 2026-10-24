import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TournamentFormatId } from '@psd/contracts';
import { simulate, type SimulationResult } from '@psd/tournament/scheduler';
import { fetchConsole } from '../api/tournament.js';
import { useAsyncData } from './useAsyncData.js';
import {
  FORMAT_CHOICES,
  blankStage,
  movedStage,
  optionsOf,
  patchStage,
  pipelineProblem,
  specOfStages,
  templateStages,
  withoutStage,
  type SetupDraft,
  type StageDraft,
} from './useTournamentSetup.js';

/**
 * ADR-279 — the Simulator subtab: the scheduler package run in the browser, planning a day before it
 * exists. Defaults are the room as it stands — the teams registered now and the courts switched on —
 * and every knob re-plans at once, because `simulate()` is pure and a day is a few dozen matches.
 *
 * It is the same `build` and the same `plan` the live tournament runs, so what the superadmin rehearses
 * here is what Start will do.
 */

export interface SimulatorKnobs {
  /** ADR-311 — rehearse one format, or a stage pipeline (ADR-310). */
  buildMode: 'format' | 'pipeline';
  stages: StageDraft[];
  formatId: TournamentFormatId;
  teamCount: string;
  courtCount: string;
  groupSize: string;
  advanceCount: string;
  hasThirdPlace: boolean;
  rounds: string;
  matchMinutes: string;
  changeoverMinutes: string;
  restMinutes: string;
  /** `HH:MM`, local. */
  startAt: string;
  /** `HH:MM`, local, or '' for no hard stop. */
  deadline: string;
}

export const INITIAL_KNOBS: SimulatorKnobs = {
  buildMode: 'format',
  stages: templateStages(),
  formatId: 'groups_knockout',
  teamCount: '8',
  courtCount: '2',
  groupSize: '4',
  advanceCount: '2',
  hasThirdPlace: true,
  rounds: '',
  matchMinutes: '12',
  changeoverMinutes: '3',
  restMinutes: '0',
  startAt: '10:00',
  deadline: '',
};

const MINUTES_PER_DAY = 24 * 60;

function minuteOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes after midnight as a clock reading, for the plan's start and finish columns. */
export function clockOf(minute: number | null): string {
  if (minute === null) return '—';
  const inDay = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
}

/** The knobs as the setup form's draft, so the options are read by one rule (`optionsOf`). */
function asDraft(knobs: SimulatorKnobs): SetupDraft {
  return {
    name: '',
    kind: 'captains_ball',
  dumbTiers: [],
    winPoints: '0',
    drawPoints: '0',
    lossPoints: '0',
    teamIds: [],
    formatId: knobs.formatId,
    buildMode: knobs.buildMode,
    stages: knobs.stages,
    groupSize: knobs.groupSize,
    advanceCount: knobs.advanceCount,
    hasThirdPlace: knobs.hasThirdPlace,
    rounds: knobs.rounds,
    matchMinutes: knobs.matchMinutes,
    changeoverMinutes: knobs.changeoverMinutes,
    restMinutes: knobs.restMinutes,
    deadline: knobs.deadline,
  };
}

/** The simulation for these knobs, through the engine's own `simulate`. */
export function runSimulation(knobs: SimulatorKnobs): SimulationResult {
  const timings = {
    teamCount: Number(knobs.teamCount),
    courtCount: Number(knobs.courtCount),
    matchMinutes: Number(knobs.matchMinutes),
    changeoverMinutes: Number(knobs.changeoverMinutes),
    restMinutes: Number(knobs.restMinutes),
    startMinute: minuteOfDay(knobs.startAt) ?? 0,
    deadlineMinute: minuteOfDay(knobs.deadline),
  };
  if (knobs.buildMode === 'pipeline') {
    const teamCount = Number.isInteger(timings.teamCount) ? timings.teamCount : 0;
    const problem = pipelineProblem(knobs.stages, teamCount);
    if (problem !== null) return { error: problem, structure: null, matches: [], fit: null };
    return simulate({ pipeline: specOfStages(knobs.stages), ...timings });
  }
  return simulate({ formatId: knobs.formatId, options: optionsOf(asDraft(knobs)), ...timings });
}

export function useTournamentSimulator() {
  const room = useAsyncData(useCallback(() => fetchConsole(), []));
  const [knobs, setKnobs] = useState<SimulatorKnobs>(INITIAL_KNOBS);
  const [isSeeded, setIsSeeded] = useState(false);

  // Once, when the room is known: start from the teams registered and the courts switched on now.
  useEffect(() => {
    if (isSeeded || room.data === null) return;
    const teamCount = String(Math.max(2, room.data.teams.length));
    const courtCount = String(Math.max(1, room.data.courts.filter((court) => court.isEnabled).length));
    setKnobs((current) => ({ ...current, teamCount, courtCount }));
    setIsSeeded(true);
  }, [isSeeded, room.data]);

  const update = useCallback((patch: Partial<SimulatorKnobs>) => setKnobs((current) => ({ ...current, ...patch })), []);
  const updateStage = useCallback((index: number, patch: Partial<StageDraft>) => {
    setKnobs((current) => ({ ...current, stages: patchStage(current.stages, index, patch) }));
  }, []);
  const addStage = useCallback(() => {
    setKnobs((current) => ({ ...current, stages: [...current.stages, blankStage(current.stages.length)] }));
  }, []);
  const removeStage = useCallback((index: number) => {
    setKnobs((current) => ({ ...current, stages: withoutStage(current.stages, index) }));
  }, []);
  const moveStage = useCallback((index: number, direction: -1 | 1) => {
    setKnobs((current) => ({ ...current, stages: movedStage(current.stages, index, direction) }));
  }, []);
  const resetStages = useCallback(() => update({ stages: templateStages() }), [update]);
  const result = useMemo(() => runSimulation(knobs), [knobs]);
  return {
    knobs,
    update,
    updateStage,
    addStage,
    removeStage,
    moveStage,
    resetStages,
    result,
    formats: FORMAT_CHOICES,
    registeredTeams: room.data?.teams.length ?? null,
    enabledCourts: room.data?.courts.filter((court) => court.isEnabled).length ?? null,
  };
}
