import { useEffect, useRef } from 'react';

/**
 * Calls `onEscape` for an Escape keypress anywhere in the document while `active`.
 *
 * A dialog cannot rely on its own `onKeyDown`: it moves focus inside itself on the
 * next animation frame, and any key that arrives before that frame — or while focus
 * still sits on the trigger — never reaches the dialog at all (ADDENDUM-043).
 * The handler is held in a ref so a new closure per render does not re-subscribe.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handler.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
