import { useCallback, useRef, useState } from 'react';
import { useFrameStudio } from '@/features/frame-studio';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import { SEQUENCE_CHAPTERS, DEFAULT_HERO_TITLE } from '../data/sequence';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import type { GatsbySceneManager } from '../scene/GatsbySceneManager';
import { usePremiereRuntime } from './usePremiereRuntime';
import { usePremiereSceneOptions } from './usePremiereSceneOptions';
import { usePremiereTransport } from './usePremiereTransport';

export function usePremiereController() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<GatsbySceneManager | null>(null);
  const audioRef = useRef<CinemaAudioEngine | null>(null);
  const lastUiSyncRef = useRef(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [activeAct, setActiveAct] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [cameraMode, setCameraMode] = useState<CameraMode>('cinema');
  const [nitrateMode, setNitrateMode] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [heroConfig, setHeroConfig] = useState<HeroTitleConfig>({ ...DEFAULT_HERO_TITLE });

  const onTelemetry = useCallback((telemetry: { currentTime: number; isPlaying: boolean }) => {
    const now = performance.now();
    if (now - lastUiSyncRef.current <= 48) return;
    lastUiSyncRef.current = now;
    setCurrentTime(telemetry.currentTime);
    setIsPlaying(telemetry.isPlaying);
  }, []);
  const onChapterChange = useCallback((chapterIndex: number) => setActiveAct(chapterIndex), []);

  usePremiereRuntime({ mountRef: stageRef, managerRef, audioRef, onTelemetry, onChapterChange });
  const getSceneManager = useCallback(() => managerRef.current, []);
  const frameStudio = useFrameStudio(getSceneManager);
  const transport = usePremiereTransport({
    managerRef,
    audioRef,
    cameraMode,
    setCameraMode,
    setCurrentTime,
    setActiveAct,
    setIsPlaying,
  });
  const sceneOptions = usePremiereSceneOptions({
    managerRef,
    audioRef,
    cameraMode,
    nitrateMode,
    setCameraMode,
    setNitrateMode,
    setSoundOn,
    setHeroConfig,
    setActiveAct,
    setIsPlaying,
  });
  const currentChapter = SEQUENCE_CHAPTERS[activeAct] ?? SEQUENCE_CHAPTERS[0];

  return {
    stageRef,
    currentTime,
    activeAct,
    isPlaying,
    cameraMode,
    nitrateMode,
    soundOn,
    heroConfig,
    currentChapter,
    frameStudio,
    ...transport,
    ...sceneOptions,
  };
}