import { useState } from 'react';
import { useSpectacle } from '@/features/spectacle';
import { useBackdropActions } from './useBackdropActions';
import { useCelebrationActions } from './useCelebrationActions';
import { useEffectRunner } from './useEffectRunner';
import { useStageSettings } from './useStageSettings';
import { useTransitionActions } from './useTransitionActions';

/** Composes the console's state; components only render what it returns. */
export function useSpectaclePreview() {
  const { qualityTier, simulatedReducedMotion, setSimulatedReducedMotion } = useSpectacle();
  const [open, setOpen] = useState(false);
  const [marqueeOn, setMarqueeOn] = useState(true);
  const runner = useEffectRunner();
  const settings = useStageSettings();
  const backdrop = useBackdropActions({ runner, settings });
  const transitions = useTransitionActions({ runner, origin: settings.origin });
  const celebration = useCelebrationActions({
    runner, origin: settings.origin, seed: settings.seed, onCountdownComplete: backdrop.playFinale,
  });

  return {
    open, setOpen, marqueeOn, setMarqueeOn,
    playing: runner.playing, stopAll: runner.stopAll,
    qualityTier, simulatedReducedMotion, setSimulatedReducedMotion,
    ...settings, ...backdrop, ...transitions, ...celebration,
  };
}

export type SpectaclePreview = ReturnType<typeof useSpectaclePreview>;
