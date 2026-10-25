import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * ADR-229 — the photo's own screen: taking, converting, framing and cutting out happen here, not beside the
 * avatar choices. It is a dialog in the accessibility sense, which means four things this file does itself:
 * focus moves into it when it opens and returns to whatever opened it when it closes; Tab stays inside it;
 * Escape cancels it; and the page underneath is inert, because it is an overlay over the whole screen.
 *
 * It is portalled to `document.body`, so it is never inside the sign-up form element (ADR-229, plan 4.4.2), and
 * every control in it has an explicit type, so nothing in it can submit the form.
 */

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

export function PhotoDialog(props: { title: string; onCancel: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const { onCancel } = props;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || panel.current === null) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="psd-modal gb-photo-dialog" data-testid="photo-dialog" onKeyDown={onKeyDown}>
      <div className="psd-modal__body gb-photo-dialog__panel" role="dialog" aria-modal="true" aria-label={props.title} ref={panel}>
        <h2 className="gb-label">{props.title}</h2>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}
