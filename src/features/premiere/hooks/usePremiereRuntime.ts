import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { parseFreezeAt } from '../model/freeze';
import { parseRenderer, type RendererMode } from '../model/renderer';
import { GatsbySceneManager } from '../scene/GatsbySceneManager';
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';
import {
  createPremiereStore,
  storeSceneApi,
  type PremiereStoreApi,
} from '../scene3d/premiereStore';

interface PremiereRuntimeOptions {
  mountRef: RefObject<HTMLDivElement | null>;
  managerRef: MutableRefObject<PremiereSceneApi | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
}

/** What the view needs to mount the right renderer. */
export interface PremiereRuntime {
  renderer: RendererMode;
  /** Non-null only for the React scene. */
  store: PremiereStoreApi | null;
  sceneCallbacks: {
    onTelemetry: (telemetry: PlaybackTelemetry) => void;
    onChapterChange: (chapterIndex: number) => void;
    onFrameReady: () => void;
  };
}

/**
 * Owns the audio engine and whichever renderer the URL selects. React Three Fiber
 * is the default; `?renderer=classic` keeps the imperative manager available while
 * the screenshot gate is outstanding (ADDENDUM-026 §5).
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

  const [renderer] = useState<RendererMode>(() => parseRenderer(window.location.search));
  const storeRef = useRef<PremiereStoreApi | null>(null);
  if (renderer === 'r3f' && storeRef.current === null) {
    storeRef.current = createPremiereStore({
      freezeAt: parseFreezeAt(window.location.search) ?? undefined,
    });
  }
  const store = storeRef.current;

  const sceneCallbacks = useMemo(
    () => ({
      onTelemetry: (telemetry: PlaybackTelemetry) => callbacksRef.current.onTelemetry(telemetry),
      onChapterChange: (chapterIndex: number) => {
        callbacksRef.current.onChapterChange(chapterIndex);
        audioRef.current?.triggerActShimmer(chapterIndex);
      },
      onFrameReady: () => {
        const container = mountRef.current;
        if (container) container.dataset.frameReady = 'true';
      },
    }),
    [audioRef, mountRef]
  );

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new CinemaAudioEngine();
    audioRef.current = audio;

    if (renderer === 'r3f' && store) {
      managerRef.current = storeSceneApi(store);
      return () => {
        audio.dispose();
        managerRef.current = null;
        audioRef.current = null;
      };
    }

    const manager = new GatsbySceneManager(container, {
      freezeAt: parseFreezeAt(window.location.search) ?? undefined,
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
  }, [audioRef, managerRef, mountRef, renderer, store]);

  return { renderer, store, sceneCallbacks };
}
