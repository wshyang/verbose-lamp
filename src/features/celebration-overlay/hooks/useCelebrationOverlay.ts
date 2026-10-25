import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSpectacle, type EffectHandle } from '@/features/spectacle';
import {
  buildEffectCall,
  CELEBRATION_ORIGIN,
  CELEBRATION_SEED,
  findCelebrationAction,
  groupCelebrationActions,
  nextSeed,
  playEffectCall,
} from '../model/celebrationActions';

const FINALE_MS = 12000;

/**
 * Decides everything the celebration overlay does: which actions are live,
 * which backdrop toggles are on, and how a countdown chains into the finale.
 * The launcher component only renders what this returns.
 */
export function useCelebrationOverlay() {
  const { play, stopAll, isReady } = useSpectacle();
  const [isOpen, setOpen] = useState(false);
  const [activeToggles, setActiveToggles] = useState<ReadonlySet<string>>(new Set());
  const handles = useRef(new Map<string, EffectHandle>());
  const seedRef = useRef(CELEBRATION_SEED);

  const close = useCallback(() => setOpen(false), []);
  const toggleOpen = useCallback(() => setOpen((open) => !open), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const stopToggle = useCallback((id: string) => {
    handles.current.get(id)?.stop();
    handles.current.delete(id);
    setActiveToggles((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const startToggle = useCallback(
    (id: string, handle: EffectHandle) => {
      handles.current.set(id, handle);
      setActiveToggles((prev) => new Set(prev).add(id));
    },
    [],
  );

  const runAction = useCallback(
    (id: string) => {
      const action = findCelebrationAction(id);
      if (!action) return;
      if (action.isToggle && handles.current.has(id)) {
        stopToggle(id);
        return;
      }
      seedRef.current = nextSeed(seedRef.current);
      const seed = seedRef.current;
      if (id === 'countdown') {
        play('countdown', {
          from: 3,
          onComplete: () => play('fireworks', { seed, finale: true, durationMs: FINALE_MS }),
        });
        return;
      }
      const call = buildEffectCall(id, { origin: CELEBRATION_ORIGIN, seed });
      if (!call) return;
      const handle = playEffectCall(play, call);
      if (action.isToggle) startToggle(id, handle);
    },
    [play, startToggle, stopToggle],
  );

  const stopEverything = useCallback(() => {
    stopAll();
    handles.current.clear();
    setActiveToggles(new Set());
  }, [stopAll]);

  const groups = useMemo(() => groupCelebrationActions(activeToggles), [activeToggles]);

  return {
    isOpen,
    isReady,
    groups,
    hasActiveToggles: activeToggles.size > 0,
    toggleOpen,
    close,
    runAction,
    stopEverything,
  };
}

export type CelebrationOverlay = ReturnType<typeof useCelebrationOverlay>;
