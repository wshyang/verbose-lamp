import { createPortal } from 'react-dom';
import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { getFocusableElements, useDialogFocus } from '@/shared/hooks/useDialogFocus';
import { useEscapeKey } from '@/shared/hooks/useEscapeKey';

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

export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
  className = '',
  backdropClassName = 'fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-md p-4',
  testId,
  closeOnBackdrop = true,
}: DialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useDialogFocus(open, dialogRef);
  // Escape also works while focus is still outside the dialog: the focus move above happens a
  // frame after opening, and a key pressed in that gap would otherwise reach nothing.
  useEscapeKey(open, () => closeRef.current());

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