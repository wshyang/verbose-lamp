import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { GatsbySceneManager } from '../scene/GatsbySceneManager';
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';

export interface PremiereRuntimeOptions {
  mountRef: RefObject<HTMLDivElement | null>;
  managerRef: MutableRefObject<PremiereSceneApi | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
}

export function usePremiereRuntime({
  mountRef,
  managerRef,
  audioRef,
  onTelemetry,
  onChapterChange,
}: PremiereRuntimeOptions) {
  const callbacksRef = useRef({ onTelemetry, onChapterChange });
  callbacksRef.current = { onTelemetry, onChapterChange };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new CinemaAudioEngine();
    audioRef.current = audio;
    const manager = new GatsbySceneManager(container, {
      onTelemetry: (telemetry) => callbacksRef.current.onTelemetry(telemetry),
      onChapterChange: (chapterIndex) => {
        callbacksRef.current.onChapterChange(chapterIndex);
        audio.triggerActShimmer(chapterIndex);
      },
    });
    managerRef.current = manager;

    return () => {
      manager.dispose();
      audio.dispose();
      managerRef.current = null;
      audioRef.current = null;
    };
  }, [audioRef, managerRef, mountRef]);
}