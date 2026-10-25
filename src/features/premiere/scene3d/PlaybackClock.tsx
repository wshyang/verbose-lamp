import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex } from '../scene/choreography';
import type { PlaybackTelemetry } from '../scene/sceneApi';
import { usePremiereStoreApi } from './usePremiereStore';

interface PlaybackClockProps {
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (index: number) => void;
  onFrameReady: () => void;
}

/**
 * The manager's animate() head, at frame priority −1 so every other
 * component reads the new playhead (ADDENDUM-022 §2.3): advance the clock
 * (dt capped at 0.05, store guards freeze/pause/wrap), fire chapter
 * changes, emit telemetry at the 48 ms throttle the controller used to
 * own, and after 3 frames of a frozen scene signal `frameReady` — the
 * handshake the e2e suite waits on before screenshotting.
 */
export function PlaybackClock({ onTelemetry, onChapterChange, onFrameReady }: PlaybackClockProps) {
  const store = usePremiereStoreApi();
  const lastChapterRef = useRef<number | null>(null);
  const lastTelemetryRef = useRef(0);
  const framesRenderedRef = useRef(0);

  useFrame((_, delta) => {
    const state = store.getState();
    state.advanceBy(Math.min(0.05, delta));
    const { currentTime, isPlaying, freezeAt } = store.getState();
    const chapterIndex = activeChapterIndex(currentTime, SEQUENCE_CHAPTERS);
    if (chapterIndex !== lastChapterRef.current) {
      lastChapterRef.current = chapterIndex;
      onChapterChange(chapterIndex);
    }
    const now = performance.now();
    if (now - lastTelemetryRef.current > 48) {
      lastTelemetryRef.current = now;
      onTelemetry({ currentTime, activeChapterIndex: chapterIndex, isPlaying });
    }
    if (freezeAt !== null && framesRenderedRef.current < 3) {
      framesRenderedRef.current += 1;
      if (framesRenderedRef.current >= 3) onFrameReady();
    }
  }, -1);

  return null;
}
