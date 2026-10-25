import { useState, type MutableRefObject, type RefObject } from 'react';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import { parseFreezeAt } from '../model/freeze';
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';
import { createPremiereStore, type PremiereStoreApi } from '../scene3d/premiereStore';
import { usePremiereCallbacks } from './usePremiereCallbacks';
import { useSceneLifecycle } from './useSceneLifecycle';

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
  const [store] = useState<PremiereStoreApi>(() =>
    createPremiereStore({ freezeAt: parseFreezeAt(window.location.search) }),
  );
  const callbacks = usePremiereCallbacks({ mountRef, audioRef, onTelemetry, onChapterChange });
  useSceneLifecycle({ mountRef, managerRef, audioRef, store });

  return { store, ...callbacks };
}
