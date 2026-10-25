import { useCallback, useMemo, useRef, useState } from 'react';
import { useFrameStudio } from '@/features/frame-studio';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import { SEQUENCE_CHAPTERS, DEFAULT_HERO_TITLE } from '../data/sequence';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { parseRendererMode } from '../scene/rendererMode';
import { createPremiereStore } from '../scene3d/premiereStore';
import { parseFreezeAt } from '../model/freeze';
import { usePremiereRuntime } from './usePremiereRuntime';
import { usePremiereSceneOptions } from './usePremiereSceneOptions';
import { usePremiereTransport } from './usePremiereTransport';

export function usePremiereController() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<PremiereSceneApi | null>(null);
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

  /**
   * Which renderer this visit asked for, and — for the React Three Fiber port — the
   * store the canvas renders from (ADDENDUM-022 §6 steps 2.1, 2.5). A plain visit gets
   * the manager and no store, so nothing about the default path changes.
   */
  const renderer = useMemo(
    () => parseRendererMode(typeof window === 'undefined' ? '' : window.location.search),
    []
  );
  const store = useMemo(
    () =>
      renderer === 'r3f'
        ? createPremiereStore({
            freezeAt: parseFreezeAt(typeof window === 'undefined' ? '' : window.location.search),
          })
        : null,
    [renderer]
  );

  const { onSceneTelemetry, onSceneChapterChange } = usePremiereRuntime({
    mountRef: stageRef,
    managerRef,
    audioRef,
    onTelemetry,
    onChapterChange,
    store,
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
    renderer,
    store,
    sceneTelemetry: onSceneTelemetry,
    sceneChapterChange: onSceneChapterChange,
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