import { useCallback, useRef, useState } from 'react';
import { useFrameStudio } from '@/features/frame-studio';
import { SEQUENCE_CHAPTERS, DEFAULT_HERO_TITLE } from '../data/sequence';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import { usePremiereRuntime } from './usePremiereRuntime';
import { usePremiereSceneOptions } from './usePremiereSceneOptions';
import { usePremiereTransport } from './usePremiereTransport';

export function usePremiereController() {
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

  const runtime = usePremiereRuntime({ onTelemetry, onChapterChange });
  const getSceneApi = useCallback(() => runtime.sceneApi, [runtime.sceneApi]);
  const frameStudio = useFrameStudio(getSceneApi);
  const transport = usePremiereTransport({
    sceneApi: runtime.sceneApi,
    audioRef: runtime.audioRef,
    cameraMode,
    setCameraMode,
    setCurrentTime,
    setActiveAct,
    setIsPlaying,
  });
  const sceneOptions = usePremiereSceneOptions({
    sceneApi: runtime.sceneApi,
    audioRef: runtime.audioRef,
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
    sceneStore: runtime.store,
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
