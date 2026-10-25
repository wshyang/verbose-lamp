import { useEffect, useRef } from 'react';

export const AMBIENT_START_DELAY_MS = 450;

interface AmbientShowOptions {
  /** True once the spectacle stage exists; before that `play` is a no-op. */
  isReady: boolean;
  start: () => void;
}

/**
 * Starts the ambient show once, shortly after the stage is ready. The timer is
 * cleared on unmount, and the started flag is set inside the timer so a
 * StrictMode re-run never toggles the show off again.
 */
export function useAmbientShow({ isReady, start }: AmbientShowOptions): void {
  const hasStarted = useRef(false);
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    if (!isReady || hasStarted.current) return;
    const timer = window.setTimeout(() => {
      hasStarted.current = true;
      startRef.current();
    }, AMBIENT_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isReady]);
}
