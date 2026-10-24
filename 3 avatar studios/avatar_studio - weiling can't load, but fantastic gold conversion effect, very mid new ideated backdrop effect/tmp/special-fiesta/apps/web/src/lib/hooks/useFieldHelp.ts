import { useCallback, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type RefObject } from 'react';

/**
 * ADR-319 — when a field's help is on screen.
 *
 * Three things open it: the pointer on the (i), focus on the (i), and a press on it. It is removed
 * when all three have let go, and at once when focus leaves, a press lands anywhere else, or Escape
 * is pressed. The press is its own state because a touch screen has no hover and Safari does not
 * focus a button on tap, so neither of the other two can be relied on to hold the tooltip up long
 * enough to read it — and a press does not toggle, which avoids the hover-then-click double toggle
 * (the participant AvatarPeek's lesson).
 */

export interface HelpState {
  isHovered: boolean;
  isFocused: boolean;
  isPressed: boolean;
}

export type HelpEvent = 'pointerenter' | 'pointerleave' | 'focus' | 'blur' | 'press' | 'dismiss';

const CLOSED: HelpState = { isHovered: false, isFocused: false, isPressed: false };

/** The distance kept between a shifted tooltip and the screen's edge. */
const EDGE_MARGIN_PX = 8;

export function nextHelpState(state: HelpState, event: HelpEvent): HelpState {
  switch (event) {
    case 'pointerenter':
      return { ...state, isHovered: true };
    case 'pointerleave':
      return { ...state, isHovered: false };
    case 'focus':
      return { ...state, isFocused: true };
    case 'blur':
      // Focus leaving takes a press with it: the owner's rule is that the tooltip goes with focus.
      return { ...state, isFocused: false, isPressed: false };
    case 'press':
      return { ...state, isPressed: true };
    case 'dismiss':
      return CLOSED;
  }
}

export function isHelpOpen(state: HelpState): boolean {
  return state.isHovered || state.isFocused || state.isPressed;
}

/** How far to slide a tooltip sideways so it sits inside the screen, with a margin. */
export function clampShift(box: { left: number; right: number }, viewportWidth: number): number {
  if (box.right > viewportWidth) return -(box.right - viewportWidth + EDGE_MARGIN_PX);
  if (box.left < 0) return -box.left + EDGE_MARGIN_PX;
  return 0;
}

/** Leaves the document alone until the help is open, then listens for the two ways to dismiss it. */
function useDismissWhileOpen(input: { isOpen: boolean; dismiss: () => void; field: RefObject<HTMLElement | null> }): void {
  const { isOpen, dismiss, field } = input;
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event: Event) => {
      if (field.current?.contains(event.target as Node)) return;
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, dismiss, field]);
}

/** Measures the open tooltip and returns the sideways shift that keeps it on the screen. */
function useEdgeShift(input: { isOpen: boolean; tooltip: RefObject<HTMLElement | null> }): number {
  const { isOpen, tooltip } = input;
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const element = tooltip.current;
    if (!isOpen || element === null) {
      setShift(0);
      return;
    }
    // Measure where it would sit unshifted, so the answer does not feed on itself.
    const box = element.getBoundingClientRect();
    // clientWidth, not innerWidth: a tooltip that overflows makes Chrome's mobile layout viewport
    // grow to fit it, so innerWidth would report the overflow as the screen.
    setShift((current) => clampShift({ left: box.left - current, right: box.right - current }, document.documentElement.clientWidth));
  }, [isOpen, tooltip]);
  return shift;
}

export function useFieldHelp() {
  const [state, send] = useReducer(nextHelpState, CLOSED);
  const field = useRef<HTMLElement | null>(null);
  const tooltip = useRef<HTMLElement | null>(null);
  const tooltipId = useId();
  const isOpen = isHelpOpen(state);

  const dismiss = useCallback(() => send('dismiss'), []);
  useDismissWhileOpen({ isOpen, dismiss, field });
  const shift = useEdgeShift({ isOpen, tooltip });

  const handlers = {
    onPointerEnter: () => send('pointerenter'),
    onPointerLeave: () => send('pointerleave'),
    onFocus: () => send('focus'),
    onBlur: () => send('blur'),
    onClick: () => send('press'),
  };
  return { isOpen, tooltipId, handlers, field, tooltip, shift };
}
