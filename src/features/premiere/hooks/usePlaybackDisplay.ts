import { useCallback, useRef, useState } from 'react';

/** The page re-renders at most this often for scene telemetry; the scene itself runs at frame rate. */
const TELEMETRY_INTERVAL_MS = 48;

/** What the page shows about playback: time, play state and act, fed by the scene's telemetry. */
export function usePlaybackDisplay() {
  const lastUiSyncRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeAct, setActiveAct] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const onTelemetry = useCallback((telemetry: { currentTime: number; isPlaying: boolean }) => {
    const now = performance.now();
    if (now - lastUiSyncRef.current <= TELEMETRY_INTERVAL_MS) return;
    lastUiSyncRef.current = now;
    setCurrentTime(telemetry.currentTime);
    setIsPlaying(telemetry.isPlaying);
  }, []);
  const onChapterChange = useCallback((chapterIndex: number) => setActiveAct(chapterIndex), []);

  return {
    currentTime, setCurrentTime,
    activeAct, setActiveAct,
    isPlaying, setIsPlaying,
    onTelemetry, onChapterChange,
  };
}
