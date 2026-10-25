import { useCallback, useRef, useState } from 'react';
import { useFrameStudio } from '@/features/frame-studio';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import { SEQUENCE_CHAPTERS, DEFAULT_HERO_TITLE } from '../data/sequence';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { usePremiereRuntime } from './usePremiereRuntime';
import { useTelemetryBridge } from './useTelemetryBridge';
import { usePremiereSceneOptions } from './usePremiereSceneOptions';
import { usePremiereTransport } from './usePremiereTransport';

export function usePremiereController() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<PremiereSceneApi | null>(null);
  const audioRef = useRef<CinemaAudioEngine | null>(null);
  const { currentTime, setCurrentTime, activeAct, setActiveAct, isPlaying, setIsPlaying, onTelemetry, onChapterChange } = useTelemetryBridge();
  const [cameraMode, setCameraMode] = useState<CameraMode>('cinema');
  const [nitrateMode, setNitrateMode] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [heroConfig, setHeroConfig] = useState<HeroTitleConfig>({ ...DEFAULT_HERO_TITLE });

  const runtime = usePremiereRuntime({
    mountRef: stageRef,
    managerRef,
    audioRef,
    onTelemetry,
    onChapterChange,
  });
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
    runtime,
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