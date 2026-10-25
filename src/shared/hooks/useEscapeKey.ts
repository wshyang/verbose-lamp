import { useEffect, useRef } from 'react';

/**
 * Calls `onEscape` for an Escape keypress anywhere in the document while `active`.
 *
 * A dialog cannot rely on its own `onKeyDown`: it moves focus inside itself on the next animation
 * frame, and any key that arrives before that frame, or while focus still sits on the trigger,
 * never reaches the dialog at all. The handler is held in a ref so a new closure per render does
 * not re-subscribe.
 *
 * Active listeners form a stack and only the most recently activated one fires, so a dialog opened
 * over another is dismissed alone (PR #5's topmost rule, which PR #4's per-hook listener lacked).
 */
const activeHandlers: Array<{ current: () => void }> = [];

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  // The listener is attached only while the stack is non-empty, so there is always a top.
  const topmost = activeHandlers[activeHandlers.length - 1];
  event.preventDefault();
  topmost.current();
}

export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    if (activeHandlers.length === 0) window.addEventListener('keydown', onKeyDown);
    activeHandlers.push(handler);
    return () => {
      // This effect pushed `handler` and runs its cleanup once, so it is always in the stack.
      activeHandlers.splice(activeHandlers.indexOf(handler), 1);
      if (activeHandlers.length === 0) window.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);
}
