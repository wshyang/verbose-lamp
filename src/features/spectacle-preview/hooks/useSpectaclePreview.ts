import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useSpectacle, type EffectHandle, type EffectId, type EffectParamsMap, type NormRect,
} from '@/features/spectacle';
import { parseNavLines, validateNavItems } from '@/features/gilded-ui';
import { DEFAULT_NAV_LINES } from '../data/previewCatalogue';

/** Decides everything the preview panel shows; components only render. */
export function useSpectaclePreview() {
  const { play, stopAll, qualityTier, simulatedReducedMotion, setSimulatedReducedMotion } = useSpectacle();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState({ x: 0.5, y: 0.42 });
  const [picking, setPicking] = useState(false);
  const [intensity, setIntensity] = useState(0.6);
  const [seed, setSeed] = useState(1925);
  const [keepClearOn, setKeepClearOn] = useState(false);
  const [speaker, setSpeaker] = useState<NormRect>({ x: 0.42, y: 0.28, w: 0.16, h: 0.24 });
  const [demoScreen, setDemoScreen] = useState<'A' | 'B'>('A');
  const [marqueeOn, setMarqueeOn] = useState(true);
  const [playing, setPlaying] = useState<ReadonlySet<string>>(new Set());
  const handles = useRef(new Map<string, EffectHandle>());
  const [navText, setNavText] = useState(DEFAULT_NAV_LINES);
  const [latticeSeed, setLatticeSeed] = useState(1925);
  const [latticeDensity, setLatticeDensity] = useState(0.7);
  const [latticeLevel, setLatticeLevel] = useState(4);

  const navValidation = useMemo(() => validateNavItems(parseNavLines(navText)), [navText]);
  const navItems = useMemo(
    () => (navValidation.ok ? navValidation.items : parseNavLines(DEFAULT_NAV_LINES)),
    [navValidation],
  );
  const keepClear = useMemo(() => (keepClearOn ? [speaker] : []), [keepClearOn, speaker]);

  const run = useCallback(
    <K extends EffectId>(key: string, id: K, params: EffectParamsMap[K]) => {
      const handle = play(id, params);
      handles.current.get(key)?.stop();
      handles.current.set(key, handle);
      setPlaying((prev) => new Set(prev).add(key));
      void handle.finished.then(() => {
        if (handles.current.get(key) !== handle) return;
        handles.current.delete(key);
        setPlaying((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
    },
    [play],
  );

  const toggle = useCallback(
    <K extends EffectId>(key: string, id: K, params: EffectParamsMap[K]) => {
      const existing = handles.current.get(key);
      if (existing) existing.stop();
      else run(key, id, params);
    },
    [run],
  );

  const toggleFireworks = useCallback(() => {
    toggle('fireworks', 'fireworks', { continuous: true, intensity, seed, keepClear, greenLight: true });
  }, [toggle, intensity, seed, keepClear]);

  const playFinale = useCallback(() => {
    run('finale', 'fireworks', { finale: true, intensity: 1, seed, keepClear, greenLight: true });
  }, [run, seed, keepClear]);

  const toggleSearchlights = useCallback(() => {
    toggle('searchlights', 'searchlights', { beams: 3, seed, keepClear });
  }, [toggle, seed, keepClear]);

  const toggleChampagne = useCallback(() => {
    toggle('champagne', 'champagne', { seed });
  }, [toggle, seed]);

  const swapDemo = useCallback(() => setDemoScreen((s) => (s === 'A' ? 'B' : 'A')), []);

  const playOrb = useCallback(
    (key: string, pattern: 'sides' | 'corners', direction: 'outward' | 'inward') => {
      run(key, 'orb-transition', { origin, pattern, direction, onCovered: swapDemo });
    },
    [run, origin, swapDemo],
  );

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

  const playConfetti = useCallback(
    (mode: 'burst' | 'rain') => run(`confetti-${mode}`, 'confetti', { mode, origin, seed }),
    [run, origin, seed],
  );

  const playCountdown = useCallback(() => {
    run('countdown', 'countdown', { from: 5, onComplete: playFinale });
  }, [run, playFinale]);

  const playNameReveal = useCallback(() => {
    run('name-reveal', 'name-reveal', { name: 'Jay Gatsby', subtitle: 'Lucky draw winner' });
  }, [run]);

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

  // Restart the ambient show shortly after keep-clear changes so it respects
  // the speaker box without thrashing during a drag.
  const ambientLive = playing.has('fireworks');
  useEffect(() => {
    if (!ambientLive) return;
    const timer = window.setTimeout(() => {
      handles.current.get('fireworks')?.stop();
      run('fireworks', 'fireworks', { continuous: true, intensity, seed, keepClear, greenLight: true });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepClear]);

  return {
    open, setOpen, origin, picking, setPicking, intensity, setIntensity,
    seed, setSeed, rerollSeed: () => setSeed(Math.floor(Math.random() * 1e6)),
    keepClearOn, setKeepClearOn, speaker, moveSpeaker, demoScreen,
    marqueeOn, setMarqueeOn, playing, navText, setNavText, navValidation, navItems,
    latticeSeed, setLatticeSeed, latticeDensity, setLatticeDensity, latticeLevel, setLatticeLevel,
    qualityTier, simulatedReducedMotion, setSimulatedReducedMotion,
    toggleFireworks, playFinale, toggleSearchlights, toggleChampagne,
    playOrb, playSunburst, playConfetti, playCountdown, playNameReveal,
    onStageClick, stopAll,
  };
}

export type SpectaclePreview = ReturnType<typeof useSpectaclePreview>;