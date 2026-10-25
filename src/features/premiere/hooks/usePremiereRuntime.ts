import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { GatsbySceneManager, type PlaybackTelemetry } from '../scene/GatsbySceneManager';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { parseFreezeAt } from '../model/freeze';
import type { PremiereStore } from '../scene3d/premiereStore';
import { storeSceneApi } from '../scene3d/storeSceneApi';

interface PremiereRuntimeOptions {
  mountRef: RefObject<HTMLDivElement | null>;
  managerRef: MutableRefObject<PremiereSceneApi | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
  /**
   * When present, the React Three Fiber port owns the scene and this hook only bridges
   * it: the manager is not constructed at all (ADDENDUM-022 §6 step 2.4).
   */
  store?: PremiereStore | null;
}

/**
 * The runtime seam. Both renderers need the same two side effects — the audio engine
 * and an imperative `PremiereSceneApi` — so both are set up here, and the hooks above
 * never learn which renderer they are talking to.
 */
export function usePremiereRuntime({
  mountRef,
  managerRef,
  audioRef,
  onTelemetry,
  onChapterChange,
  store = null,
}: PremiereRuntimeOptions) {
  const callbacksRef = useRef({ onTelemetry, onChapterChange });
  callbacksRef.current = { onTelemetry, onChapterChange };

  /** Chapter handovers also shimmer the audio, whichever renderer reported them. */
  const handleChapterChange = useCallback(
    (chapterIndex: number) => {
      callbacksRef.current.onChapterChange(chapterIndex);
      audioRef.current?.triggerActShimmer(chapterIndex);
    },
    [audioRef]
  );

  const handleTelemetry = useCallback(
    (telemetry: PlaybackTelemetry) => callbacksRef.current.onTelemetry(telemetry),
    []
  );

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new CinemaAudioEngine();
    audioRef.current = audio;

    if (store) {
      managerRef.current = storeSceneApi(store);
      return () => {
        audio.dispose();
        managerRef.current = null;
        audioRef.current = null;
      };
    }

    const manager = new GatsbySceneManager(container, {
      freezeAt: parseFreezeAt(window.location.search) ?? undefined,
      onTelemetry: handleTelemetry,
      onChapterChange: handleChapterChange,
    });
    managerRef.current = manager;

    return () => {
      manager.dispose();
      audio.dispose();
      managerRef.current = null;
      audioRef.current = null;
    };
  }, [audioRef, handleChapterChange, handleTelemetry, managerRef, mountRef, store]);

  return { onSceneTelemetry: handleTelemetry, onSceneChapterChange: handleChapterChange };
}
