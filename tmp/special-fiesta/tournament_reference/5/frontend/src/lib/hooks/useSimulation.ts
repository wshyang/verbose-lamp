import { useMemo, useState } from 'react';
import { generateFormat, getFormat } from '../../../../shared/formats/index.js';
import { simulate } from '../../../../shared/schedule.js';
import { parseTimeToMinutes } from '../../../../shared/time.js';
import type { SimulationResult, TournamentConfig } from '../../../../shared/types.js';

export interface SimulationState {
  mode: string;
  teamCount: number;
  courts: number;
  matchLengthMinutes: number;
  tournamentLengthMinutes: number;
  startTime: string;
  restMinutes: number;
  setMode: (mode: string) => void;
  setTeamCount: (value: number) => void;
  setCourts: (value: number) => void;
  setMatchLengthMinutes: (value: number) => void;
  setTournamentLengthMinutes: (value: number) => void;
  setStartTime: (value: string) => void;
  setRestMinutes: (value: number) => void;
  effectiveRestMinutes: number;
  validationError: string | null;
  result: SimulationResult | null;
  config: TournamentConfig;
}

export function useSimulation(): SimulationState {
  const [mode, setMode] = useState('round-robin');
  const [teamCount, setTeamCount] = useState(8);
  const [courts, setCourts] = useState(2);
  const [matchLengthMinutes, setMatchLengthMinutes] = useState(20);
  const [tournamentLengthMinutes, setTournamentLengthMinutes] = useState(480);
  const [startTime, setStartTime] = useState('09:00');
  const [restMinutes, setRestMinutes] = useState(5);

  const derived = useMemo(() => {
    const format = getFormat(mode);
    const effectiveRestMinutes = format.enforcedRestMinutes ?? restMinutes;
    const config: TournamentConfig = {
      courts, matchLengthMinutes, tournamentLengthMinutes,
      startMinutes: parseTimeToMinutes(startTime), restMinutes: effectiveRestMinutes,
      winPoints: 3, drawPoints: 1, lossPoints: 0,
    };
    const validationError = format.validate(teamCount);
    const result = validationError === null
      ? simulate(generateFormat(mode, teamCount), config)
      : null;
    return { effectiveRestMinutes, config, validationError, result };
  }, [mode, teamCount, courts, matchLengthMinutes, tournamentLengthMinutes, startTime, restMinutes]);

  return {
    mode, teamCount, courts, matchLengthMinutes, tournamentLengthMinutes, startTime, restMinutes,
    setMode, setTeamCount, setCourts, setMatchLengthMinutes, setTournamentLengthMinutes,
    setStartTime, setRestMinutes, ...derived,
  };
}
