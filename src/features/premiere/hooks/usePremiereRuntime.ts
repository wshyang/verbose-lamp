import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { parseFreezeAt } from '../model/freeze';
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';
import { createPremiereStore, storeSceneApi } from '../scene3d/premiereStore';

interface PremiereRuntimeOptions {
  managerRef: MutableRefObject<PremiereSceneApi | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
}

/**
 * Owns the premiere's runtime objects (ADDENDUM-022 §2.4): the zustand
 * store the R3F stage renders from — exposed to the transport,
 * scene-options and Frame Studio hooks through the same
 * PremiereSceneApi port the imperative manager satisfied — and the
 * audio engine. The store exists from the first render, so the Canvas
 * mounts immediately; the scene callbacks handed to it stay stable.
 */
export function usePremiereRuntime({
  managerRef,
  audioRef,
  onTelemetry,
  onChapterChange,
}: PremiereRuntimeOptions) {
  const [runtime] = useState(() => {
    const store = createPremiereStore(parseFreezeAt(window.location.search));
    return { store, api: storeSceneApi(store) };
  });
  const callbacksRef = useRef({ onTelemetry, onChapterChange });
  callbacksRef.current = { onTelemetry, onChapterChange };

  useEffect(() => {
    const audio = new CinemaAudioEngine();
    audioRef.current = audio;
    managerRef.current = runtime.api;
    return () => {
      audio.dispose();
      managerRef.current = null;
      audioRef.current = null;
    };
  }, [audioRef, managerRef, runtime]);

  const handleSceneTelemetry = useCallback(
    (telemetry: PlaybackTelemetry) => callbacksRef.current.onTelemetry(telemetry),
    [],
  );
  const handleSceneChapterChange = useCallback(
    (chapterIndex: number) => {
      callbacksRef.current.onChapterChange(chapterIndex);
      audioRef.current?.triggerActShimmer(chapterIndex);
    },
    [audioRef],
  );

  return { store: runtime.store, handleSceneTelemetry, handleSceneChapterChange };
}
