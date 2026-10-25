import { useCallback, useEffect, useState } from 'react';
import { panelStartsOpen } from '../model/panelStart';

/**
 * Whether the panel is showing, plus the `F` hotkey. The hotkey is ignored while
 * the user is typing, so an `f` in the title field never hides the panel.
 *
 * The initial state depends on the viewport (ADDENDUM-044): on a phone the panel
 * would otherwise start on top of everything the user can see.
 */
export function usePanelVisibility() {
  const [isOpen, setIsOpen] = useState(() => panelStartsOpen(window.innerWidth));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key.toLowerCase() === 'f') setIsOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const dismiss = useCallback(() => setIsOpen(false), []);
  const reveal = useCallback(() => setIsOpen(true), []);

  return { isOpen, dismiss, reveal };
}
