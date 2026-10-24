import { useEffect, useMemo, useState } from 'react';
import {
  FORMAT_CATALOG,
  type AwardPointsInput,
  type CreateTournamentInput,
  type FinalizeMatchInput,
  type FormatDescriptor,
  type LiveScoreInput,
  type ModeId,
  type PreviewInput,
  type SimulationResult,
  type StageMatchInput,
  type TournamentRecord,
  type TournamentSettings,
  type TournamentSnapshot,
  type WeatherChangeInput,
} from '../../shared/contracts.js';
import { api, ApiError } from '../api.js';
import { buildMatchSections, sortTimeline } from '../presentation.js';

const initialSettings: TournamentSettings = {
  teamCount: 8,
  courtCount: 3,
  matchDurationMinutes: 20,
  tournamentLengthMinutes: 240,
  startTimeMinutes: 540,
};

export type DeskView = 'simulator' | 'tournament';

export function useTournamentDesk() {
  const [formats, setFormats] = useState<FormatDescriptor[]>([...FORMAT_CATALOG]);
  const [recentTournaments, setRecentTournaments] = useState<TournamentRecord[]>([]);
  const [selectedMode, setSelectedMode] = useState<ModeId>('single-elimination');
  const [settings, setSettings] = useState(initialSettings);
  const [tournamentName, setTournamentName] = useState('Saturday Open');
  const [teamNames, setTeamNames] = useState(createTeamNames(initialSettings.teamCount));
  const [preview, setPreview] = useState<SimulationResult | null>(null);
  const [tournament, setTournament] = useState<TournamentSnapshot | null>(null);
  const [activeView, setActiveView] = useState<DeskView>('simulator');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [weather, setWeather] = useState<WeatherChangeInput>({
    courtCount: initialSettings.courtCount,
    matchDurationMinutes: initialSettings.matchDurationMinutes,
    effectiveAtMinutes: initialSettings.startTimeMinutes,
  });

  useEffect(() => {
    const mountStatus = { current: true };
    void loadDashboard(
      mountStatus,
      setFormats,
      setRecentTournaments,
      setTournament,
      setWeather,
      setError,
      setLoading,
    );
    return () => {
      mountStatus.current = false;
    };
  }, []);

  const matchSections = useMemo(() => {
    const mode = tournament?.tournament.mode ?? preview?.mode ?? selectedMode;
    const matches = tournament?.matches ?? preview?.matches ?? [];
    return buildMatchSections(mode, matches);
  }, [preview, selectedMode, tournament]);
  const timeline = useMemo(
    () => sortTimeline(tournament?.matches ?? preview?.matches ?? []),
    [preview, tournament],
  );

  async function previewFormat(): Promise<void> {
    const input: PreviewInput = { mode: selectedMode, settings, teamNames };
    await runAction(() => api.preview(input), setPreview);
  }

  async function createTournament(): Promise<void> {
    const input: CreateTournamentInput = { name: tournamentName, mode: selectedMode, settings, teamNames };
    await runAction(async () => {
      const created = await api.createTournament(input);
      const recent = await api.getTournaments();
      return { created, recent };
    }, ({ created, recent }) => {
      setTournament(created);
      setPreview(null);
      setActiveView('tournament');
      setRecentTournaments(recent);
      setWeather(weatherForTournament(created));
    });
  }

  async function openTournament(tournamentId: string): Promise<void> {
    await runAction(() => api.getTournament(tournamentId), (snapshot) => {
      setTournament(snapshot);
      setActiveView('tournament');
      setWeather(weatherForTournament(snapshot));
    });
  }

  async function applyWeatherChange(): Promise<void> {
    if (!tournament) return;
    await runAction(
      () => api.changeResources(tournament.tournament.id, weather),
      setTournament,
    );
  }

  async function stageMatch(input: StageMatchInput): Promise<void> {
    if (!tournament) return;
    await runAction(() => api.stageMatch(tournament.tournament.id, input), setTournament);
  }

  async function saveLiveScore(matchId: string, score: LiveScoreInput): Promise<void> {
    if (!tournament) return;
    await runAction(
      () => api.updateLiveScore(tournament.tournament.id, matchId, score),
      setTournament,
    );
  }

  async function finalizeMatch(matchId: string, result: FinalizeMatchInput): Promise<void> {
    if (!tournament) return;
    await runAction(
      () => api.finalizeMatch(tournament.tournament.id, matchId, result),
      setTournament,
    );
  }

  async function awardPoints(input: AwardPointsInput): Promise<void> {
    if (!tournament) return;
    await runAction(() => api.awardPoints(tournament.tournament.id, input), setTournament);
  }

  async function voidPointAward(entryId: string, reason: string): Promise<void> {
    if (!tournament) return;
    await runAction(
      () => api.voidPointAward(tournament.tournament.id, entryId, reason),
      setTournament,
    );
  }

  async function closeTournament(reason: string): Promise<void> {
    if (!tournament) return;
    await runAction(() => api.closeTournament(tournament.tournament.id, reason), setTournament);
  }

  function updateSetting<Key extends keyof TournamentSettings>(key: Key, value: TournamentSettings[Key]): void {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setPreview(null);
  }

  function updateTeamCount(teamCount: number): void {
    updateSetting('teamCount', teamCount);
    setTeamNames((previous) => resizeTeamNames(previous, teamCount));
  }

  function changeMode(mode: ModeId): void {
    setSelectedMode(mode);
    setPreview(null);
    const fixedCount = formats.find((format) => format.id === mode)?.fixedTeamCount;
    if (fixedCount) updateTeamCount(fixedCount);
  }

  function updateWeather<Key extends keyof WeatherChangeInput>(
    key: Key,
    value: WeatherChangeInput[Key],
  ): void {
    setWeather((previous) => ({ ...previous, [key]: value }));
  }

  async function runAction<Value>(
    work: () => Promise<Value>,
    onSuccess: (value: Value) => void,
  ): Promise<void> {
    setBusy(true);
    setError('');
    try {
      onSuccess(await work());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return {
    formats,
    recentTournaments,
    selectedMode,
    settings,
    tournamentName,
    teamNames,
    preview,
    tournament,
    activeView,
    matchSections,
    timeline,
    weather,
    loading,
    busy,
    error,
    setTournamentName,
    setTeamNames,
    setActiveView,
    changeMode,
    updateSetting,
    updateTeamCount,
    updateWeather,
    previewFormat,
    createTournament,
    openTournament,
    applyWeatherChange,
    stageMatch,
    saveLiveScore,
    finalizeMatch,
    awardPoints,
    voidPointAward,
    closeTournament,
  };
}

function createTeamNames(teamCount: number): string[] {
  return Array.from({ length: teamCount }, (_, index) => `Team ${index + 1}`);
}

function resizeTeamNames(current: string[], teamCount: number): string[] {
  return Array.from({ length: teamCount }, (_, index) => current[index] ?? `Team ${index + 1}`);
}

function weatherForTournament(snapshot: TournamentSnapshot): WeatherChangeInput {
  return {
    courtCount: snapshot.tournament.courtCount,
    matchDurationMinutes: snapshot.tournament.matchDurationMinutes,
    effectiveAtMinutes: snapshot.tournament.startTimeMinutes,
  };
}

async function loadDashboard(
  mountStatus: { current: boolean },
  setFormats: (formats: FormatDescriptor[]) => void,
  setRecent: (tournaments: TournamentRecord[]) => void,
  setTournament: (tournament: TournamentSnapshot | null) => void,
  setWeather: (weather: WeatherChangeInput) => void,
  setError: (message: string) => void,
  setLoading: (loading: boolean) => void,
): Promise<void> {
  try {
    const [formatList, recent] = await Promise.all([api.getFormats(), api.getTournaments()]);
    if (!mountStatus.current) return;
    setFormats(formatList);
    setRecent(recent);
    await openMostRecent(recent, mountStatus, setTournament, setWeather);
  } catch (caught) {
    if (mountStatus.current) setError(errorMessage(caught));
  } finally {
    if (mountStatus.current) setLoading(false);
  }
}

async function openMostRecent(
  recent: TournamentRecord[],
  mountStatus: { current: boolean },
  setTournament: (tournament: TournamentSnapshot | null) => void,
  setWeather: (weather: WeatherChangeInput) => void,
): Promise<void> {
  const latest = recent[0];
  if (!latest) return;
  const snapshot = await api.getTournament(latest.id);
  if (!mountStatus.current) return;
  setTournament(snapshot);
  setWeather(weatherForTournament(snapshot));
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message || 'The request could not be completed.';
  return 'The request could not be completed.';
}
