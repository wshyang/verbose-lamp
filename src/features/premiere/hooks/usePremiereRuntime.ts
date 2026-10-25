import { useRef, type MutableRefObject, type RefObject } from 'react';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { RendererMode } from '../model/renderer';
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';
import type { PremiereStoreApi } from '../scene3d/premiereStore';
import { useRendererMount } from './useRendererMount';
import { useRendererSelection } from './useRendererSelection';
import { useSceneCallbacks } from './useSceneCallbacks';

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
 * Owns the audio engine and whichever renderer the URL selects (ADDENDUM-038).
 * Composition only: `useRendererSelection` reads the URL and builds the store,
 * `useSceneCallbacks` keeps the two renderers speaking the same three callbacks,
 * and `useRendererMount` owns the effect that constructs and disposes them.
 */
export function usePremiereRuntime({
  mountRef,
  managerRef,
  audioRef,
  onTelemetry,
  onChapterChange,
}: PremiereRuntimeOptions): PremiereRuntime {
  const handlersRef = useRef({ onTelemetry, onChapterChange });
  handlersRef.current = { onTelemetry, onChapterChange };

  const { renderer, store } = useRendererSelection();
  const sceneCallbacks = useSceneCallbacks({ audioRef, mountRef, handlersRef });
  const live = { onTelemetry: sceneCallbacks.onTelemetry, onChapterChange: sceneCallbacks.onChapterChange };

  useRendererMount({ mountRef, managerRef, audioRef, ...live }, { renderer, store });

  return { renderer, store, sceneCallbacks };
}
