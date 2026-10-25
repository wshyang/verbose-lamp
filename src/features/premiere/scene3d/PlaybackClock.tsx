import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex } from '../scene/choreography';
import { FRAME_READY_FRAMES } from './playback';
import type { PremiereStore } from './premiereStore';

export interface PlaybackTelemetry {
  currentTime: number;
  activeChapterIndex: number;
  isPlaying: boolean;
}

interface PlaybackClockProps {
  store: PremiereStore;
  /** The element that carries `data-frame-ready` for the screenshot gate. */
  containerRef?: { current: HTMLElement | null };
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  /** Telemetry is throttled to this many milliseconds, as the manager did. */
  telemetryIntervalMs?: number;
}

/**
 * The film's clock (ADDENDUM-022 §6 step 2.3). One `useFrame` at priority −1, so it
 * runs before anything that reads the time in the same frame.
 *
 * It owns the three things the manager did on its animation frame: advance the clock,
 * announce chapter handovers, and report telemetry on a 48 ms cadence. It also owns
 * `data-frame-ready`, which the likeness gate waits for — three composites, not one.
 */
export function PlaybackClock({
  store,
  containerRef,
  onTelemetry,
  onChapterChange,
  telemetryIntervalMs = 48,
}: PlaybackClockProps) {
  const lastChapter = useRef(-1);
  const lastTelemetry = useRef(-Infinity);
  const frames = useRef(0);

  useFrame((_state, delta) => {
    store.getState().advance(delta);

    const { currentTime, isPlaying, freezeAt } = store.getState();
    const chapter = activeChapterIndex(currentTime, SEQUENCE_CHAPTERS);

    if (chapter !== lastChapter.current) {
      lastChapter.current = chapter;
      onChapterChange?.(chapter);
    }

    const now = performance.now();
    if (onTelemetry && now - lastTelemetry.current >= telemetryIntervalMs) {
      lastTelemetry.current = now;
      onTelemetry({ currentTime, activeChapterIndex: chapter, isPlaying });
    }

    if (freezeAt !== null && containerRef?.current) {
      frames.current += 1;
      if (frames.current === FRAME_READY_FRAMES) containerRef.current.dataset.frameReady = 'true';
    }
  }, -1);

  return null;
}
