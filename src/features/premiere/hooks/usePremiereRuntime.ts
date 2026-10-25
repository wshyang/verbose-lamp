import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { parseFreezeAt } from '../model/freeze';
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';
import { armScene, createPremiereStore, storeSceneApi, type PremiereStore } from '../scene3d/premiereStore';

export interface PremiereRuntimeOptions {
  mountRef: RefObject<HTMLDivElement | null>;
  managerRef: MutableRefObject<PremiereSceneApi | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
}

/**
 * Creates the scene's store (ADDENDUM-022 §6.4) and owns the audio engine. Rendering happens
 * in the React tree, so this hook no longer builds a Three.js host; it only wires the store to
 * the audio, the React callbacks, and the `data-frame-ready` flag the e2e gate waits on.
 */
export function usePremiereRuntime({
  mountRef,
  managerRef,
  audioRef,
  onTelemetry,
  onChapterChange,
}: PremiereRuntimeOptions): PremiereStore {
  const callbacksRef = useRef({ onTelemetry, onChapterChange });
  callbacksRef.current = { onTelemetry, onChapterChange };
  // The store is created once, so it follows whichever audio ref the latest render holds.
  const audioRefLatest = useRef(audioRef);
  audioRefLatest.current = audioRef;

  const [store] = useState(() =>
    createPremiereStore({
      freezeAt: parseFreezeAt(window.location.search),
      onTelemetry: (telemetry) => callbacksRef.current.onTelemetry(telemetry),
      onChapterChange: (chapterIndex) => {
        callbacksRef.current.onChapterChange(chapterIndex);
        audioRefLatest.current.current?.triggerActShimmer(chapterIndex);
      },
      onFrameReady: () => {
        const host = mountRef.current;
        if (host) host.dataset.frameReady = 'true';
      },
    }),
  );

  useEffect(() => {
    if (!mountRef.current) return;

    const audio = new CinemaAudioEngine();
    audioRef.current = audio;
    const scene = storeSceneApi(store);
    managerRef.current = scene;

    // StrictMode mounts, disposes and remounts this effect, and `dispose()` stops the clock.
    armScene(store);

    return () => {
      scene.dispose();
      audio.dispose();
      managerRef.current = null;
      audioRef.current = null;
    };
  }, [audioRef, managerRef, mountRef, store]);

  return store;
}
