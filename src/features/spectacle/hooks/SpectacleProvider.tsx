import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/shared/hooks/useReducedMotion';
import { SpectacleLayer } from '../components/SpectacleLayer';
import type { QualityTier, SpectacleStage } from '../model/types';
import { useSpectacleStage } from './useSpectacleStage';

interface SpectacleApi {
  play: SpectacleStage['play'];
  stopAll(): void;
  qualityTier: QualityTier | null;
  /** True once the stage exists; `play` is a no-op before that. */
  isReady: boolean;
  reducedMotion: boolean;
  simulatedReducedMotion: boolean;
  setSimulatedReducedMotion(value: boolean): void;
}

interface SpectacleProviderProps {
  children: ReactNode;
  className?: string;
}

const SpectacleContext = createContext<SpectacleApi | null>(null);

/** Mounts the stage once; React never touches canvas internals. */
export function SpectacleProvider({ children, className }: SpectacleProviderProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [simulated, setSimulated] = useState(false);
  const systemReduced = useReducedMotion();
  const reducedMotion = systemReduced || simulated;
  const { play, stopAll, qualityTier, isReady } = useSpectacleStage({
    hostRef, reducedMotion, onAnnounce: setAnnouncement,
  });

  const api = useMemo<SpectacleApi>(
    () => ({
      play, stopAll, qualityTier, isReady, reducedMotion,
      simulatedReducedMotion: simulated,
      setSimulatedReducedMotion: setSimulated,
    }),
    [play, stopAll, qualityTier, isReady, reducedMotion, simulated],
  );

  return (
    <SpectacleContext.Provider value={api}>
      <SpectacleLayer hostRef={hostRef} announcement={announcement} className={className}>
        {children}
      </SpectacleLayer>
    </SpectacleContext.Provider>
  );
}

export function useSpectacle(): SpectacleApi {
  const ctx = useContext(SpectacleContext);
  if (!ctx) throw new Error('useSpectacle must be used inside SpectacleProvider');
  return ctx;
}
