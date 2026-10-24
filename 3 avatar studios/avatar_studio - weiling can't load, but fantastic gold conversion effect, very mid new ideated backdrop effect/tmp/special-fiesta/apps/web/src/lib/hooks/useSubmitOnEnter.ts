import { useCallback } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * ADR-085 — Enter sends, Shift+Enter starts a new line.
 *
 * For a `<textarea>` that is really a send box: chat, and the superadmin's announcement. A phone
 * keyboard's send key and a desktop Enter are the same event, so handling it here is what makes
 * "typed it, sent it" true on both without the sender reaching for a button.
 *
 * Three guards, each for a real case rather than for tidiness:
 *
 *   - **Shift+Enter still breaks the line**, which is the escape hatch that makes Enter-to-send
 *     safe to impose. Ctrl, Alt and Meta are let through untouched for the same reason.
 *   - **`isComposing` is not a send.** An IME — Chinese, Japanese, Korean — uses Enter to accept
 *     the candidate it is offering, and sending there would post a half-finished word and eat the
 *     keystroke that was choosing it. This app runs in Singapore, so that is an ordinary case.
 *   - **`canSend` is asked, not assumed.** The button is disabled while a send is in flight, while
 *     the box is empty and while it is over the cap; the keyboard must refuse for the same reasons
 *     or it becomes a way around the very guards the button advertises.
 *
 * `keyCode === 229` is the pre-`isComposing` signal that older WebKit sends mid-composition. ADR-041
 * makes Safari first-class, so the cheap extra check stays.
 */
const IME_KEY_CODE = 229;

export function useSubmitOnEnter(input: {
  canSend: boolean;
  send: () => void;
}): (event: KeyboardEvent<HTMLTextAreaElement>) => void {
  const { canSend, send } = input;

  return useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter') return;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === IME_KEY_CODE) return;
      // Prevented before the guard below, or a refused send still leaves a newline in the box.
      event.preventDefault();
      if (!canSend) return;
      send();
    },
    [canSend, send],
  );
}
