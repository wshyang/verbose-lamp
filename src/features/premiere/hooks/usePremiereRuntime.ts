import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { parseFreezeAt } from '../model/freeze';
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';
import { createPremiereStore, type PremiereStoreApi } from '../scene3d/premiereStore';
import { storeSceneApi } from '../scene3d/storeSceneApi';

interface PremiereRuntimeOptions {
  mountRef: RefObject<HTMLDivElement | null>;
  managerRef: MutableRefObject<PremiereSceneApi | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
}

export interface PremiereRuntime {
  /** The scene's store, created once so it survives StrictMode's mount, dispose, remount. */
  store: PremiereStoreApi;
  /** The callbacks the React scene reports through. */
  onSceneTelemetry: (telemetry: PlaybackTelemetry) => void;
  onSceneChapterChange: (chapterIndex: number) => void;
  onSceneFrameReady: () => void;
}

/**
 * The runtime seam: the audio engine plus an imperative `PremiereSceneApi` backed by the
 * scene's store, so the hooks above never reach into Three.js (ADDENDUM-022 §2.4).
 *
 * The store is created once here. Nothing in `dispose()` touches it, so a live premiere keeps
 * playing and a frozen one stays frozen through StrictMode's mount, dispose, remount.
 */
export function usePremiereRuntime({
  mountRef,
  managerRef,
  audioRef,
  onTelemetry,
  onChapterChange,
}: PremiereRuntimeOptions): PremiereRuntime {
  const callbacksRef = useRef({ onTelemetry, onChapterChange });
  callbacksRef.current = { onTelemetry, onChapterChange };

  const [store] = useState<PremiereStoreApi>(() =>
    createPremiereStore({ freezeAt: parseFreezeAt(window.location.search) }),
  );

  /** Chapter hand-overs also shimmer the audio. */
  const handleChapterChange = useCallback(
    (chapterIndex: number) => {
      callbacksRef.current.onChapterChange(chapterIndex);
      audioRef.current?.triggerActShimmer(chapterIndex);
    },
    [audioRef],
  );
  const handleTelemetry = useCallback(
    (telemetry: PlaybackTelemetry) => callbacksRef.current.onTelemetry(telemetry),
    [],
  );
  const handleFrameReady = useCallback(() => {
    const host = mountRef.current;
    if (host) host.dataset.frameReady = 'true';
  }, [mountRef]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new CinemaAudioEngine();
    audioRef.current = audio;

    const scene = storeSceneApi(store);
    managerRef.current = scene;
    return () => {
      scene.dispose();
      audio.dispose();
      managerRef.current = null;
      audioRef.current = null;
    };
  }, [audioRef, managerRef, mountRef, store]);

  return {
    store,
    onSceneTelemetry: handleTelemetry,
    onSceneChapterChange: handleChapterChange,
    onSceneFrameReady: handleFrameReady,
  };
}
