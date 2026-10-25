import { useCallback, useRef } from 'react';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { usePlaybackDisplay } from './usePlaybackDisplay';
import { usePremiereRuntime } from './usePremiereRuntime';
import { usePremiereSceneOptions } from './usePremiereSceneOptions';
import { usePremiereSettings } from './usePremiereSettings';
import { usePremiereTransport } from './usePremiereTransport';

export function usePremiereController() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<PremiereSceneApi | null>(null);
  const audioRef = useRef<CinemaAudioEngine | null>(null);

  const display = usePlaybackDisplay();
  const settings = usePremiereSettings();
  const { onTelemetry, onChapterChange } = display;

  const runtime = usePremiereRuntime({ mountRef: stageRef, managerRef, audioRef, onTelemetry, onChapterChange });
  const getSceneApi = useCallback(() => managerRef.current, []);
  const transport = usePremiereTransport({ managerRef, audioRef, ...display, ...settings });
  const sceneOptions = usePremiereSceneOptions({ managerRef, audioRef, ...display, ...settings });

  return {
    stageRef,
    runtime,
    currentTime: display.currentTime,
    activeAct: display.activeAct,
    isPlaying: display.isPlaying,
    cameraMode: settings.cameraMode,
    nitrateMode: settings.nitrateMode,
    soundOn: settings.soundOn,
    heroConfig: settings.heroConfig,
    currentChapter: SEQUENCE_CHAPTERS[display.activeAct] ?? SEQUENCE_CHAPTERS[0],
    getSceneApi,
    ...transport,
    ...sceneOptions,
  };
}
