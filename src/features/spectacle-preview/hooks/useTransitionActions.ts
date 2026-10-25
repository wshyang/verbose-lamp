import { useCallback, useState } from 'react';
import type { EffectRunner } from './useEffectRunner';

type DemoScreen = 'A' | 'B';

interface TransitionInputs {
  runner: EffectRunner;
  origin: { x: number; y: number };
}

/** Sparkler and sunburst transitions; the A/B demo screen swaps while covered. */
export function useTransitionActions({ runner, origin }: TransitionInputs) {
  const { run } = runner;
  const [demoScreen, setDemoScreen] = useState<DemoScreen>('A');
  const swapDemo = useCallback(() => setDemoScreen((s) => (s === 'A' ? 'B' : 'A')), []);

  const playSparkler = useCallback(
    (key: string, pattern: 'sides' | 'corners', direction: 'outward' | 'inward') => {
      run(key, 'sparkler-transition', { origin, pattern, direction, onCovered: swapDemo });
    },
    [run, origin, swapDemo],
  );

  /** @deprecated Use `playSparkler`; kept for existing preview consumers. */
  const playOrb = playSparkler;

  const playSunburst = useCallback(
    (key: string, variant: 'iris' | 'fan') => {
      run(key, 'sunburst-wipe', {
        origin: variant === 'fan' ? { x: 0.5, y: 1 } : origin,
        variant,
        onCovered: swapDemo,
      });
    },
    [run, origin, swapDemo],
  );

  return { demoScreen, playSparkler, playOrb, playSunburst };
}
