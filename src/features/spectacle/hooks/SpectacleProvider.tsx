import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { SpectacleLayer } from '../components/SpectacleLayer';
import { createSpectacleStage } from '../engine/createSpectacleStage';
import type { EffectHandle, QualityTier, SpectacleStage } from '../model/types';
import { useReducedMotion } from '@/shared/hooks/useReducedMotion';

interface SpectacleApi {
  play: SpectacleStage['play'];
  stopAll(): void;
  qualityTier: QualityTier | null;
  reducedMotion: boolean;
  simulatedReducedMotion: boolean;
  setSimulatedReducedMotion(value: boolean): void;
}

const SpectacleContext = createContext<SpectacleApi | null>(null);

const NOOP_HANDLE: EffectHandle = { finished: Promise.resolve(), stop: () => {} };

/** Mounts the stage once; React never touches canvas internals. */
export function SpectacleProvider({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<SpectacleStage | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [qualityTier, setQualityTier] = useState<QualityTier | null>(null);
  const [simulated, setSimulated] = useState(false);
  const systemReduced = useReducedMotion();
  const reducedMotion = systemReduced || simulated;

  useEffect(() => {
    if (!hostRef.current) return;
    const stage = createSpectacleStage({
      host: hostRef.current,
      onAnnounce: setAnnouncement,
      reducedMotion: systemReduced || simulated,
    });
    stageRef.current = stage;
    setQualityTier(stage.qualityTier);
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    stageRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  const play = useCallback<SpectacleStage['play']>(
    (id, params) => stageRef.current?.play(id, params) ?? NOOP_HANDLE,
    [],
  );
  const stopAll = useCallback(() => stageRef.current?.stopAll(), []);

  const api = useMemo<SpectacleApi>(
    () => ({
      play, stopAll, qualityTier, reducedMotion,
      simulatedReducedMotion: simulated,
      setSimulatedReducedMotion: setSimulated,
    }),
    [play, stopAll, qualityTier, reducedMotion, simulated],
  );

  return (
    <SpectacleContext.Provider value={api}>
      <SpectacleLayer hostRef={hostRef} announcement={announcement}>
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