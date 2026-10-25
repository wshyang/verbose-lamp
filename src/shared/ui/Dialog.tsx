import { createPortal } from 'react-dom';
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  testId?: string;
  closeOnBackdrop?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * Escape must close a dialog even when focus has not landed inside it yet
 * (the focus rAF can lag behind a busy main thread, ADDENDUM-030). Open
 * dialogs register their closers on a stack; one document listener closes
 * only the topmost. Keys pressed inside a dialog are handled by the
 * section's own onKeyDown, whose stopPropagation keeps them from here.
 */
const openDialogClosers: Array<() => void> = [];

function closeTopmostDialog(event: globalThis.KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const closeTopmost = openDialogClosers[openDialogClosers.length - 1];
  if (!closeTopmost) return;
  event.preventDefault();
  closeTopmost();
}

function registerDialogCloser(close: () => void): () => void {
  if (openDialogClosers.length === 0) document.addEventListener('keydown', closeTopmostDialog);
  openDialogClosers.push(close);
  return () => {
    const at = openDialogClosers.indexOf(close);
    if (at >= 0) openDialogClosers.splice(at, 1);
    if (openDialogClosers.length === 0) document.removeEventListener('keydown', closeTopmostDialog);
  };
}

export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
  className = '',
  backdropClassName = 'fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4',
  testId,
  closeOnBackdrop = true,
}: DialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return registerDialogCloser(() => closeRef.current());
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeRef.current();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) closeRef.current();
  };

  return createPortal(
    <div className={backdropClassName} onClick={handleBackdropClick} data-testid={testId}>
      <section
        ref={dialogRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </section>
    </div>,
    document.body
  );
}