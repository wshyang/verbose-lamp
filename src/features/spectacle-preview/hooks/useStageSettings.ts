import { useCallback, useMemo, useState } from 'react';
import type { NormRect } from '@/features/spectacle';
import { DEFAULT_SEED } from '@/shared/lib/random';

const SEED_REROLL_RANGE = 1e6;
const DEFAULT_ORIGIN = { x: 0.5, y: 0.42 } as const;
const DEFAULT_SPEAKER: NormRect = { x: 0.42, y: 0.28, w: 0.16, h: 0.24 };

/** Origin, intensity, seed and the keep-clear speaker box that every effect shares. */
export function useStageSettings() {
  const [origin, setOrigin] = useState<{ x: number; y: number }>(DEFAULT_ORIGIN);
  const [picking, setPicking] = useState(false);
  const [intensity, setIntensity] = useState(0.6);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [keepClearOn, setKeepClearOn] = useState(false);
  const [speaker, setSpeaker] = useState<NormRect>(DEFAULT_SPEAKER);

  const keepClear = useMemo(() => (keepClearOn ? [speaker] : []), [keepClearOn, speaker]);

  const onStageClick = useCallback(
    (clientX: number, clientY: number) => {
      if (!picking) return false;
      setOrigin({ x: clientX / window.innerWidth, y: clientY / window.innerHeight });
      setPicking(false);
      return true;
    },
    [picking],
  );

  const moveSpeaker = useCallback((dx: number, dy: number) => {
    setSpeaker((r) => ({
      ...r,
      x: Math.min(1 - r.w, Math.max(0, r.x + dx)),
      y: Math.min(1 - r.h, Math.max(0, r.y + dy)),
    }));
  }, []);

  const rerollSeed = useCallback(() => setSeed(Math.floor(Math.random() * SEED_REROLL_RANGE)), []);

  return {
    origin, picking, setPicking, intensity, setIntensity, seed, setSeed, rerollSeed,
    keepClearOn, setKeepClearOn, keepClear, speaker, moveSpeaker, onStageClick,
  };
}

export type StageSettings = ReturnType<typeof useStageSettings>;
