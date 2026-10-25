import { useCallback, useEffect, useRef } from 'react';
import type { EffectRunner } from './useEffectRunner';
import type { StageSettings } from './useStageSettings';

const RESTART_DEBOUNCE_MS = 350;

interface BackdropInputs {
  runner: EffectRunner;
  settings: StageSettings;
}

/** Fireworks, finale, searchlights and champagne, restarted when keep-clear changes. */
export function useBackdropActions({ runner, settings }: BackdropInputs) {
  const { run, toggle, stopKey, playing } = runner;
  const { intensity, seed, keepClear } = settings;
  const showKeepClear = useRef(keepClear);

  const fireworksParams = useCallback(
    () => ({ continuous: true, intensity, seed, keepClear, greenLight: true }),
    [intensity, seed, keepClear],
  );

  const toggleFireworks = useCallback(() => {
    showKeepClear.current = keepClear;
    toggle('fireworks', 'fireworks', fireworksParams());
  }, [toggle, keepClear, fireworksParams]);

  const playFinale = useCallback(() => {
    run('finale', 'fireworks', { finale: true, intensity: 1, seed, keepClear, greenLight: true });
  }, [run, seed, keepClear]);

  const toggleSearchlights = useCallback(() => {
    toggle('searchlights', 'searchlights', { beams: 3, seed, keepClear });
  }, [toggle, seed, keepClear]);

  const toggleChampagne = useCallback(() => {
    toggle('champagne', 'champagne', { seed });
  }, [toggle, seed]);

  // Restart the ambient show shortly after keep-clear changes so it respects
  // the speaker box without thrashing during a drag.
  const isShowLive = playing.has('fireworks');
  useEffect(() => {
    if (!isShowLive || showKeepClear.current === keepClear) return;
    const timer = window.setTimeout(() => {
      showKeepClear.current = keepClear;
      stopKey('fireworks');
      run('fireworks', 'fireworks', fireworksParams());
    }, RESTART_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isShowLive, keepClear, run, stopKey, fireworksParams]);

  return { toggleFireworks, playFinale, toggleSearchlights, toggleChampagne };
}
