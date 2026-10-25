import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, advanceTime } from '../scene/choreography';
import type { PremiereStore } from './premiereStore';

interface PlaybackClockProps {
  store: PremiereStore;
}

const TELEMETRY_INTERVAL_MS = 48;
const FRAME_READY_AFTER = 3;

/** Advances store time before every other scene subscriber renders a frame. */
export function PlaybackClock({ store }: PlaybackClockProps) {
  const lastChapterRef = useRef(-1);
  const lastTelemetryRef = useRef(Number.NEGATIVE_INFINITY);
  const frameCountRef = useRef(0);

  useFrame((_, delta) => {
    const state = store.getState();
    const frozen = state.freezeAt !== null;
    const nextTime = advanceTime({
      currentTime: state.currentTime,
      dt: frozen ? 0 : delta,
      mode: frozen ? 'frozen' : state.isPlaying ? 'playing' : 'paused',
      frozenTime: state.freezeAt ?? undefined,
    });
    if (nextTime !== state.currentTime) store.setState({ currentTime: nextTime });

    const activeIndex = activeChapterIndex({ time: nextTime, chapters: SEQUENCE_CHAPTERS });
    if (activeIndex !== lastChapterRef.current) {
      lastChapterRef.current = activeIndex;
      state.callbacks.onChapterChange(activeIndex);
    }

    const now = performance.now();
    if (now - lastTelemetryRef.current > TELEMETRY_INTERVAL_MS) {
      lastTelemetryRef.current = now;
      state.callbacks.onTelemetry({
        currentTime: nextTime,
        activeChapterIndex: activeIndex,
        isPlaying: store.getState().isPlaying,
      });
    }

    frameCountRef.current += 1;
    if (frameCountRef.current === FRAME_READY_AFTER) state.markFrameReady();
  }, -1);

  return null;
}
