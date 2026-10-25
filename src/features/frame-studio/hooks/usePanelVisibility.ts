import { useCallback, useEffect, useState } from 'react';
import { panelStartsOpen } from '../model/panelStart';

const TOGGLE_KEY = 'f';
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA']);

/** Whether the panel is showing, and the F shortcut that flips it (ignored while typing). */
export function usePanelVisibility() {
  // Sampled once at mount: a panel that opens over a phone hides the film the user came to watch.
  const [isOpen, setIsOpen] = useState(() => panelStartsOpen(window.innerWidth));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag && TYPING_TAGS.has(tag)) return;
      if (event.key.toLowerCase() === TOGGLE_KEY) setIsOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    isOpen,
    dismiss: useCallback(() => setIsOpen(false), []),
    reveal: useCallback(() => setIsOpen(true), []),
  };
}
