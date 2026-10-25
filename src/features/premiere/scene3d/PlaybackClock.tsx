import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { activeChapterIndex } from '../scene/choreography';
import type { PlaybackTelemetry } from '../scene/sceneApi';
import type { PremiereStoreApi } from './premiereStore';

/** HUD sync cadence, moved verbatim from `usePremiereController`. */
export const TELEMETRY_INTERVAL_MS = 48;
/** Frames rendered before the container announces itself screenshot-ready. */
export const FRAME_READY_COUNT = 3;
/** Longest frame step accepted, so a tab regaining focus does not jump the film. */
export const MAX_FRAME_STEP_S = 0.05;

interface PlaybackClockProps {
  store: PremiereStoreApi;
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  onFrameReady?: () => void;
}

/**
 * The single owner of time (ADDENDUM-022 §2.3). Runs before everything else, so
 * cards, camera and atmosphere all read the same frame, and it is the only place
 * that advances the playhead.
 */
export function PlaybackClock({
  store,
  onTelemetry,
  onChapterChange,
  onFrameReady,
}: PlaybackClockProps) {
  const lastSync = useRef(0);
  const lastChapter = useRef(-1);
  const frames = useRef(0);

  useFrame((state, delta) => {
    const scene = store.getState();
    const frozen = scene.freezeAt;
    const elapsed = frozen === null ? state.clock.elapsedTime : frozen;
    scene.setElapsed(elapsed);

    let time = scene.currentTime;
    if (scene.isPlaying && frozen === null) {
      time += Math.min(MAX_FRAME_STEP_S, delta);
      if (time >= TOTAL_SEQUENCE_DURATION) time = 0;
      scene.setTime(time);
    }

    const chapterIndex = activeChapterIndex(time, SEQUENCE_CHAPTERS);
    if (chapterIndex !== lastChapter.current) {
      lastChapter.current = chapterIndex;
      scene.setActiveChapterIndex(chapterIndex);
      onChapterChange?.(chapterIndex);
    }

    const now = performance.now();
    if (now - lastSync.current > TELEMETRY_INTERVAL_MS) {
      lastSync.current = now;
      onTelemetry?.({ currentTime: time, activeChapterIndex: chapterIndex, isPlaying: scene.isPlaying });
    }

    if (frozen === null || frames.current >= FRAME_READY_COUNT) return;
    frames.current += 1;
    if (frames.current === FRAME_READY_COUNT) onFrameReady?.();
  }, -2);

  return null;
}
