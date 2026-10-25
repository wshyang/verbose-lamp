import { useCallback, useRef, useState } from 'react';
import { resolveActiveId, type NavItem } from '@/features/gilded-ui';
import { pointFromElement, useSpectacle } from '@/features/spectacle';
import { useLuckyDrawStage } from '@/features/spectacle-preview';
import { OPENING_TAGLINE } from '../data/sectionTaglines';
import { resolveNavAction, taglineFor } from '../model/navActions';

const NAV_TRANSITION_MS = 1300;
const MAX_NAV_ORIGIN_Y = 0.96;
const FALLBACK_NAV_ORIGIN = { x: 0.5, y: 0.95 } as const;
const RAIN_MS = 2600;

/** Decides what the nav bar and the lucky draw do on the Event Night screen. */
export function useEventNight(navItems: readonly NavItem[]) {
  const { play } = useSpectacle();
  const navRef = useRef<HTMLDivElement | null>(null);
  const [activeNav, setActiveNav] = useState('');
  const [tagline, setTagline] = useState(OPENING_TAGLINE);
  const { open: openDraw, isOpen: isDrawOpen, close: closeDraw, handleLanded } = useLuckyDrawStage();

  const selectNav = useCallback(
    (id: string) => {
      const item = navItems.find((candidate) => candidate.id === id);
      if (!item) return;
      setActiveNav(id);
      const action = resolveNavAction(item.label);
      if (action.kind === 'open-draw') {
        openDraw();
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
    [navItems, play, openDraw],
  );

  return {
    navRef,
    tagline,
    activeId: resolveActiveId(navItems, activeNav),
    selectNav,
    isDrawOpen,
    openDraw,
    closeDraw,
    handleLanded,
  };
}
