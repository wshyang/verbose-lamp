import { useMemo, type MutableRefObject, type RefObject } from 'react';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { PlaybackTelemetry } from '../scene/sceneApi';

export interface SceneCallbacks {
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
  onFrameReady: () => void;
}

interface SceneCallbackSources {
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  mountRef: RefObject<HTMLDivElement | null>;
  handlersRef: MutableRefObject<{ onTelemetry: (telemetry: PlaybackTelemetry) => void; onChapterChange: (chapterIndex: number) => void }>;
}

/**
 * The three callbacks both renderers speak. They are stable for the lifetime of
 * the stage — the live handlers are read through a ref — so a re-render of the
 * host never re-subscribes the scene.
 */
export function useSceneCallbacks({ audioRef, mountRef, handlersRef }: SceneCallbackSources): SceneCallbacks {
  return useMemo(
    () => ({
      onTelemetry: (telemetry) => handlersRef.current.onTelemetry(telemetry),
      onChapterChange: (chapterIndex) => {
        handlersRef.current.onChapterChange(chapterIndex);
        audioRef.current?.triggerActShimmer(chapterIndex);
      },
      onFrameReady: () => {
        const container = mountRef.current;
        if (container) container.dataset.frameReady = 'true';
      },
    }),
    [audioRef, handlersRef, mountRef]
  );
}
