import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * ADR-105 — staff consoles: typing anywhere on the page lands in the screen's primary
 * text box.
 *
 * A marshal's eyes are on the queue, not on hunting a focus ring — and a hardware scan
 * gun is just a keyboard that types very fast. With this hook the fringe station takes
 * digits (from thumbs or trigger pulls) the moment the page is up, no tap required.
 *
 * The mechanism is focus-on-keydown: the browser's own default then delivers the same
 * keystroke into the newly focused input, so paste, maxLength, sanitisers and IME all
 * keep working — no manual value surgery. Guards, each one load-bearing:
 *   - an already-editable target keeps its keys (two-field pages stay sane);
 *   - modifier chords pass through (browser shortcuts survive);
 *   - Enter and Space are never captured (they activate focused buttons — hijacking them
 *     breaks both the camera controls and keyboard accessibility);
 *   - a disabled or absent input captures nothing;
 *   - `disabled` suspends capture entirely while a confirm dialog is up (ADR-027): keys
 *     must never leak under the question "award +25 to this person?".
 *
 * Staff surfaces only, by design: focus-stealing on participant pages would fight text
 * entry everywhere; here there is exactly one box that matters.
 */

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

function wantsCapture(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.isComposing) return false;
  // Printable single characters only — Enter, Space, arrows and F-keys keep their jobs.
  return event.key.length === 1 && event.key !== ' ';
}

export function useTypeAnywhere(
  inputRef: RefObject<HTMLInputElement | null>,
  options?: { disabled?: boolean | undefined },
): void {
  const disabled = options?.disabled === true;
  useEffect(() => {
    if (disabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!wantsCapture(event) || isEditable(event.target)) return;
      const input = inputRef.current;
      if (input === null || input.disabled) return;
      // Focused during keydown: the browser's default drops this very character in.
      input.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, inputRef]);
}
