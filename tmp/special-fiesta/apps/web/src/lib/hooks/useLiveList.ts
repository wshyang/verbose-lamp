import { useLayoutEffect, useRef } from 'react';
import { required } from '../required.js';

/**
 * ADR-024 — a list that updates in place.
 *
 * A polled surface used to tear itself down and rebuild: the rows blinked, the panel
 * jumped, and the participant lost whatever they were reading. Keyed rows already survive
 * a refresh, so the only thing missing is the movement between the old order and the new
 * one — without it a cluster overtaking another is a silent swap the eye cannot follow.
 *
 * FLIP, on the DOM the render just produced: remember where every row was, let React paint
 * the new order, then animate each row from its old offset back to zero. Rows also flash
 * when their own value changed, and fade in when they appear. The hook reads
 * `data-live-key` and `data-live-signature` off the rows, so a list opts in by labelling
 * its items and using the returned ref — no state, no timers, no re-render.
 *
 * Nothing here runs when the browser has no Web Animations API or the reader asked for
 * reduced motion: the content is already correct, the animation is the garnish.
 */

const MOVE_MS = 420;
const ENTER_MS = 240;
const FLASH_MS = 900;
/** ADR-296 — the flash is the active venue's accent, so it is a token, not a literal. */
const FLASH_COLOUR = 'var(--live-flash)';

interface Placement {
  top: number;
  /** ADR-095 — grids move sideways too; a single-column list simply never changes it. */
  left: number;
  signature: string;
}

function isMotionWelcome(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animateRow(row: HTMLElement, before: Placement | undefined, after: Placement): void {
  if (before === undefined) {
    row.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], {
      duration: ENTER_MS,
      easing: 'ease-out',
    });
    return;
  }
  if (before.top !== after.top || before.left !== after.left) {
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    row.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
      duration: MOVE_MS,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  }
  if (before.signature !== after.signature) {
    row.animate([{ backgroundColor: FLASH_COLOUR }, { backgroundColor: 'transparent' }], {
      duration: FLASH_MS,
      easing: 'ease-out',
    });
  }
}

export function useLiveList<T extends HTMLElement>() {
  const containerRef = useRef<T | null>(null);
  const placedRef = useRef(new Map<string, Placement>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const rows = [...container.querySelectorAll<HTMLElement>('[data-live-key]')];
    const placed = new Map<string, Placement>();
    const canAnimate = rows.length > 0 && typeof rows[0]?.animate === 'function' && isMotionWelcome();
    for (const row of rows) {
      const key = required(row.dataset['liveKey'], 'live-list key');
      const after: Placement = {
        top: row.offsetTop,
        left: row.offsetLeft,
        signature: row.dataset['liveSignature'] ?? '',
      };
      if (canAnimate) animateRow(row, placedRef.current.get(key), after);
      placed.set(key, after);
    }
    placedRef.current = placed;
  });

  return containerRef;
}
