import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Every element inside `container` that Tab should visit. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * Moves focus into a dialog when it opens, and back to the trigger when it closes.
 *
 * The move happens on the next animation frame so the panel is laid out first. That
 * one-frame gap is why a window-level Escape listener is needed as well (ADDENDUM-043):
 * anything pressed in the gap has no focused dialog to reach.
 */
export function useDialogFocus(open: boolean, dialogRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const preferred = dialog.querySelector<HTMLElement>('[autofocus], [data-autofocus="true"]');
      const first = getFocusableElements(dialog)[0];
      (preferred ?? first ?? dialog).focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true });
    };
  }, [open, dialogRef]);
}
