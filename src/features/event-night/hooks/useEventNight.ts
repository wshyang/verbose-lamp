import { useCallback, useRef, useState } from 'react';
import type { LuckyDrawEntry } from '@/features/lucky-draw';
import { playWinnerCelebration, pointFromElement, useSpectacle, winnerCelebration } from '@/features/spectacle';
import { resolveActiveId, type NavItem } from '@/features/gilded-ui';
import { OPENING_TAGLINE } from '../data/sectionTaglines';
import { resolveNavAction, taglineFor } from '../model/navActions';

const NAV_TRANSITION_MS = 1300;
const MAX_NAV_ORIGIN_Y = 0.96;
const FALLBACK_NAV_ORIGIN = { x: 0.5, y: 0.95 } as const;
const SEED_MODULUS = 100000;
const RAIN_MS = 2600;

/** Decides what the nav bar and the lucky draw do on the Event Night screen. */
export function useEventNight(navItems: readonly NavItem[]) {
  const { play } = useSpectacle();
  const navRef = useRef<HTMLDivElement | null>(null);
  const [activeNav, setActiveNav] = useState('');
  const [tagline, setTagline] = useState(OPENING_TAGLINE);
  const [isDrawOpen, setDrawOpen] = useState(false);

  const handleLanded = useCallback(
    (winner: LuckyDrawEntry) => {
      playWinnerCelebration(play, winnerCelebration({ winner, seed: Date.now() % SEED_MODULUS, sparklerCount: 0 }));
    },
    [play],
  );

  const selectNav = useCallback(
    (id: string) => {
      const item = navItems.find((candidate) => candidate.id === id);
      if (!item) return;
      setActiveNav(id);
      const action = resolveNavAction(item.label);
      if (action.kind === 'open-draw') {
        setDrawOpen(true);
        return;
      }
      const from = navRef.current ? pointFromElement(navRef.current) : FALLBACK_NAV_ORIGIN;
      play('orb-transition', {
        origin: { x: from.x, y: Math.min(from.y, MAX_NAV_ORIGIN_Y) },
        pattern: 'sides',
        direction: 'outward',
        durationMs: NAV_TRANSITION_MS,
        onCovered: () => {
          setTagline(taglineFor(action.key));
          if (action.rainConfetti) play('confetti', { mode: 'rain', durationMs: RAIN_MS });
        },
      });
    },
    [navItems, play],
  );

  return {
    navRef, tagline, isDrawOpen, openDraw: () => setDrawOpen(true), closeDraw: () => setDrawOpen(false),
    activeId: resolveActiveId(navItems, activeNav), selectNav, handleLanded,
  };
}
