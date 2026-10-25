import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { CinemaAudioEngine } from '../audio/cinemaAudio';
import { parseFreezeAt } from '../model/freeze';
import { parseRenderer, type RendererMode } from '../model/renderer';
import { GatsbySceneManager } from '../scene/GatsbySceneManager';
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
  renderer: RendererMode;
  /** The scene's store, present only when the React Three Fiber port is the renderer. */
  store: PremiereStoreApi | null;
  /** The callbacks the React scene reports through. */
  onSceneTelemetry: (telemetry: PlaybackTelemetry) => void;
  onSceneChapterChange: (chapterIndex: number) => void;
  onSceneFrameReady: () => void;
}

/**
 * The runtime seam. Both renderers need the same two side effects, the audio engine and an
 * imperative `PremiereSceneApi`, so both are set up here and the hooks above never learn
 * which renderer is behind the ref (ADDENDUM-022 §2.4).
 *
 * The default is the imperative manager; `?renderer=r3f` mounts the port, whose store is
 * created once here and survives StrictMode's mount, dispose, remount. Nothing in the
 * port's `dispose()` touches that store, so a live premiere keeps playing and a frozen
 * one stays frozen.
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
  const [store] = useState<PremiereStoreApi | null>(() =>
    renderer === 'r3f'
      ? createPremiereStore({ freezeAt: parseFreezeAt(window.location.search) })
      : null,
  );

  /** Chapter hand-overs also shimmer the audio, whichever renderer reported them. */
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

    if (store) {
      const scene = storeSceneApi(store);
      managerRef.current = scene;
      return () => {
        scene.dispose();
        audio.dispose();
        managerRef.current = null;
        audioRef.current = null;
      };
    }

    const manager = new GatsbySceneManager(container, {
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

  return {
    renderer,
    store,
    onSceneTelemetry: handleTelemetry,
    onSceneChapterChange: handleChapterChange,
    onSceneFrameReady: handleFrameReady,
  };
}
