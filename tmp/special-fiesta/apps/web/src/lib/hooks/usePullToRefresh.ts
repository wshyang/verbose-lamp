import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { scrollParentOf, scrollTopOf } from '../scrollParent.js';

/**
 * ADR-096 — pull-to-refresh for a polled list.
 *
 * The jittered poll (ADR-024) keeps a surface honest within about a minute, but a player
 * standing at the net wants the Line-ups NOW. The gesture every phone has already taught
 * them — drag the list down from its top, feel it resist, let go — asks for exactly one
 * reload, against the same endpoint the poll uses; it adds no new load shape (ADR-094
 * still absorbs anything a bored thumb produces).
 *
 * Touch events rather than pointer events, because the browser fires `pointercancel` the
 * moment it decides a finger is scrolling — which is this gesture. The drag only arms
 * while the window sits at its very top; anywhere else the finger is scrolling and the
 * page keeps it. While armed, `touchmove` is prevented so iOS Safari does not rubber-band
 * the page underneath the pull — the listener is attached by hand, non-passive, because
 * React's synthetic touch handlers are passive and may not preventDefault.
 */

export const PULL_THRESHOLD_PX = 64;
export const MAX_PULL_PX = 110;
/** How long "Refreshing" shows after release; the reload itself usually beats it. */
export const PULL_SETTLE_MS = 600;

export interface PullState {
  /** How far the surface is visually displaced right now. */
  pullPx: number;
  /** Past the threshold: letting go now will refresh. */
  isArmed: boolean;
  /** Released past the threshold; the reload has been asked for. */
  isRefreshing: boolean;
}

/** The copy under the indicator arrow, in the order the gesture moves through it. */
export function pullHintFor(state: PullState): string {
  if (state.isRefreshing) return 'Refreshing…';
  return state.isArmed ? 'Release to refresh' : 'Pull to refresh';
}

interface GestureSink {
  isBusy: () => boolean;
  readPull: () => number;
  setPull: (px: number) => void;
  trigger: () => void;
}

function clientYOf(event: TouchEvent): number | null {
  const touch = event.touches[0];
  return touch === undefined ? null : touch.clientY;
}

/** Finger travel maps to half as much panel travel, capped — the gesture's resistance. */
function dampen(travel: number): number {
  return Math.min(MAX_PULL_PX, Math.round(travel / 2));
}

function bindPullGesture(el: HTMLElement, on: GestureSink): () => void {
  // ADR-098 — the list may scroll inside `.gb-main` rather than the document; the gesture
  // arms against whichever container actually holds the scroll position.
  const container = scrollParentOf(el);
  let startY: number | null = null;
  const cancel = () => {
    startY = null;
    on.setPull(0);
  };
  const onTouchStart = (event: TouchEvent) => {
    startY = !on.isBusy() && scrollTopOf(container) <= 0 ? clientYOf(event) : null;
  };
  const onTouchMove = (event: TouchEvent) => {
    if (startY === null) return;
    const y = clientYOf(event);
    const travel = y === null ? 0 : y - startY;
    if (travel <= 0 || scrollTopOf(container) > 0) {
      on.setPull(0);
      return;
    }
    event.preventDefault();
    on.setPull(dampen(travel));
  };
  const onTouchEnd = () => {
    // No gesture in progress (never armed, or busy settling): this release is not ours.
    if (startY === null) return;
    const releasedAt = on.readPull();
    startY = null;
    if (releasedAt >= PULL_THRESHOLD_PX) on.trigger();
    else on.setPull(0);
  };
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('touchcancel', cancel);
  return () => {
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', cancel);
  };
}

export function usePullToRefresh<T extends HTMLElement>(
  onRefresh: () => void,
): { ref: RefObject<T | null>; state: PullState } {
  const ref = useRef<T | null>(null);
  const [pullPx, setPullPx] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullRef = useRef(0);
  const busyRef = useRef(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const setPull = (px: number) => {
      pullRef.current = px;
      setPullPx(px);
    };
    const unbind = bindPullGesture(el, {
      isBusy: () => busyRef.current,
      readPull: () => pullRef.current,
      setPull,
      trigger: () => {
        busyRef.current = true;
        setIsRefreshing(true);
        setPull(PULL_THRESHOLD_PX);
        refreshRef.current();
        settle = setTimeout(() => {
          busyRef.current = false;
          setIsRefreshing(false);
          setPull(0);
        }, PULL_SETTLE_MS);
      },
    });
    return () => {
      unbind();
      if (settle !== null) clearTimeout(settle);
    };
  }, []);

  return { ref, state: { pullPx, isArmed: pullPx >= PULL_THRESHOLD_PX, isRefreshing } };
}
