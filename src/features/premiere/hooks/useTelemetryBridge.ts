import { useCallback, useRef, useState } from 'react';

/** The scene reports at frame rate; the HUD is repainted at ~20 fps (48 ms). */
const UI_SYNC_INTERVAL_MS = 48;

/**
 * Turns the renderer's telemetry into React state. The throttle exists because a
 * scene at 60 fps would otherwise re-render the whole host 60 times a second for
 * a clock readout and a play/pause glyph.
 */
export function useTelemetryBridge() {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeAct, setActiveAct] = useState(0);
  const lastUiSyncRef = useRef(0);

  const onTelemetry = useCallback((telemetry: { currentTime: number; isPlaying: boolean }) => {
    const now = performance.now();
    if (now - lastUiSyncRef.current <= UI_SYNC_INTERVAL_MS) return;
    lastUiSyncRef.current = now;
    setCurrentTime(telemetry.currentTime);
    setIsPlaying(telemetry.isPlaying);
  }, []);

  const onChapterChange = useCallback((chapterIndex: number) => setActiveAct(chapterIndex), []);

  return { currentTime, setCurrentTime, isPlaying, setIsPlaying, activeAct, setActiveAct, onTelemetry, onChapterChange };
}
