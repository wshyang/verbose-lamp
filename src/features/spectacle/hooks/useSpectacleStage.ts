import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createSpectacleStage } from '../engine/createSpectacleStage';
import type { EffectHandle, QualityTier, SpectacleStage } from '../model/types';

const NOOP_HANDLE: EffectHandle = { finished: Promise.resolve(), stop: () => {} };

interface UseSpectacleStageOptions {
  hostRef: RefObject<HTMLDivElement | null>;
  reducedMotion: boolean;
  onAnnounce: (text: string) => void;
}

/** Creates the stage once for the host element and keeps it in sync. */
export function useSpectacleStage({ hostRef, reducedMotion, onAnnounce }: UseSpectacleStageOptions) {
  const stageRef = useRef<SpectacleStage | null>(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const [qualityTier, setQualityTier] = useState<QualityTier | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const stage = createSpectacleStage({
      host: hostRef.current,
      onAnnounce,
      reducedMotion: reducedRef.current,
    });
    stageRef.current = stage;
    setQualityTier(stage.qualityTier);
    return () => {
      stage.dispose();
      stageRef.current = null;
      setQualityTier(null);
    };
  }, [hostRef, onAnnounce]);

  useEffect(() => {
    stageRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  const play = useCallback<SpectacleStage['play']>(
    (id, params) => stageRef.current?.play(id, params) ?? NOOP_HANDLE,
    [],
  );
  const stopAll = useCallback(() => stageRef.current?.stopAll(), []);

  return { play, stopAll, qualityTier, isReady: qualityTier !== null };
}
