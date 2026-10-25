import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex } from '../scene/choreography';
import { isFrameReady } from '../scene/playback';
import type { PlaybackTelemetry } from '../scene/sceneApi';
import type { PremiereStoreApi } from './premiereStore';

/** Telemetry is throttled to this many milliseconds, as the controller did. */
export const TELEMETRY_INTERVAL_MS = 48;

/** Runs before everything that reads the time in the same frame. */
const CLOCK_PRIORITY = -1;

interface PlaybackClockProps {
  store: PremiereStoreApi;
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  /** Fires once, on the third drawn frame, in every mode (see `isFrameReady`). */
  onFrameReady?: () => void;
  telemetryIntervalMs?: number;
}

/**
 * The film's clock (ADDENDUM-022 §2.3). One `useFrame` that does what the manager's
 * animation frame did first: advance the film and shader clocks, announce chapter
 * hand-overs, report telemetry, and signal when the scene is ready for a screenshot.
 *
 * Callbacks come in as props, never through the store: they are wiring, not state, and
 * putting them in the store (PRs #2 and #3) makes the store depend on its host.
 */
export function PlaybackClock({
  store,
  onTelemetry,
  onChapterChange,
  onFrameReady,
  telemetryIntervalMs = TELEMETRY_INTERVAL_MS,
}: PlaybackClockProps) {
  const lastChapter = useRef(-1);
  const lastTelemetry = useRef(Number.NEGATIVE_INFINITY);
  const framesDrawn = useRef(0);

  useFrame((_state, delta) => {
    store.getState().advance(delta);

    const { currentTime, isPlaying } = store.getState();
    const chapter = activeChapterIndex(currentTime, SEQUENCE_CHAPTERS);

    if (chapter !== lastChapter.current) {
      lastChapter.current = chapter;
      store.getState().setActiveChapterIndex(chapter);
      onChapterChange?.(chapter);
    }

    const now = performance.now();
    if (now - lastTelemetry.current >= telemetryIntervalMs) {
      lastTelemetry.current = now;
      onTelemetry?.({ currentTime, activeChapterIndex: chapter, isPlaying });
    }

    framesDrawn.current += 1;
    if (isFrameReady(framesDrawn.current)) onFrameReady?.();
  }, CLOCK_PRIORITY);

  return null;
}
