import { useCallback, useRef, type MutableRefObject, type RefObject } from 'react';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { PlaybackTelemetry } from '../scene/sceneApi';

interface PremiereCallbackOptions {
  mountRef: RefObject<HTMLDivElement | null>;
  audioRef: MutableRefObject<CinemaAudioEngine | null>;
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
}

/**
 * What the scene reports through. The latest React callbacks are read from a ref, so a caller
 * that passes new functions each render never makes the scene re-subscribe.
 */
export function usePremiereCallbacks({ mountRef, audioRef, onTelemetry, onChapterChange }: PremiereCallbackOptions) {
  const callbacksRef = useRef({ onTelemetry, onChapterChange });
  callbacksRef.current = { onTelemetry, onChapterChange };

  /** Chapter hand-overs also shimmer the audio. */
  const onSceneChapterChange = useCallback(
    (chapterIndex: number) => {
      callbacksRef.current.onChapterChange(chapterIndex);
      audioRef.current?.triggerActShimmer(chapterIndex);
    },
    [audioRef],
  );
  const onSceneTelemetry = useCallback(
    (telemetry: PlaybackTelemetry) => callbacksRef.current.onTelemetry(telemetry),
    [],
  );
  const onSceneFrameReady = useCallback(() => {
    const host = mountRef.current;
    if (host) host.dataset.frameReady = 'true';
  }, [mountRef]);

  return { onSceneTelemetry, onSceneChapterChange, onSceneFrameReady };
}
