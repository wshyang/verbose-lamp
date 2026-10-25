import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { activeChapterIndex } from '../scene/choreography';
import type { PremiereStore } from './premiereStore';

/** Longest step the clock will take: a tab that was asleep must not skip an act. */
export const MAX_STEP = 0.05;
/** Frames rendered before the host is told the scene is on screen. */
export const READY_FRAMES = 3;

export interface PlaybackClockProps {
  store: PremiereStore;
}

/**
 * Owns time (ADDENDUM-022 §6.3): advances the store's playhead, reports chapter
 * hand-overs and telemetry, and flags the mount div ready. Reads and writes the store
 * outside React state on purpose — the scene re-renders only on discrete changes.
 */
export function PlaybackClock({ store }: PlaybackClockProps) {
  const rendered = useRef(0);
  const lastChapter = useRef(-1);

  useFrame((_state, delta) => {
    const state = store.getState();

    if (state.freezeAt === null && state.isPlaying) {
      let next = state.currentTime + Math.min(MAX_STEP, delta);
      if (next >= TOTAL_SEQUENCE_DURATION) next = 0;
      store.setState({ currentTime: next });
    }

    const time = store.getState().currentTime;
    const chapter = activeChapterIndex(time, SEQUENCE_CHAPTERS);
    if (chapter !== lastChapter.current) {
      lastChapter.current = chapter;
      store.getState().onChapterChange?.(chapter);
    }

    store.getState().onTelemetry?.({
      currentTime: time,
      activeChapterIndex: chapter,
      isPlaying: store.getState().isPlaying,
    });

    rendered.current += 1;
    if (rendered.current === READY_FRAMES) store.getState().onFrameReady?.();
  }, -1);

  return null;
}
