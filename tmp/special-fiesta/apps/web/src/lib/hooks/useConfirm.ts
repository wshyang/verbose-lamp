import { useCallback, useState } from 'react';
import { required } from '../required.js';

/**
 * ADR-027 — anything that awards points, ends a phase or removes somebody asks first.
 *
 * On the day these buttons are pressed one-handed, in sunlight, by someone watching a
 * game rather than the screen, and the only way back from a mis-tap is to find a
 * superadmin. The hook holds the pending request; the page renders one `<ConfirmDialog>`
 * for all of its actions, so adding a new destructive button cannot forget the guard.
 *
 * The scan box is deliberately NOT in here: a queue of twenty people cannot afford a
 * modal per person, and a wrong scan is a 15-point correction, not a match result.
 */

export interface ConfirmRequest {
  /** Short, and names the thing: "Declare Sandstorm the winner?" */
  title: string;
  /** What will actually happen, in one sentence. */
  body: string;
  confirmLabel: string;
  isDanger?: boolean | undefined;
  run: () => void;
}

export interface ConfirmState {
  request: ConfirmRequest | null;
  ask: (request: ConfirmRequest) => void;
  cancel: () => void;
  accept: () => void;
}

export function useConfirm(): ConfirmState {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const accept = useCallback(() => {
    // Only reachable while a dialog is on screen, so the request is always there.
    const pending = required(request, 'confirm request');
    setRequest(null);
    pending.run();
  }, [request]);

  return {
    request,
    ask: useCallback((next: ConfirmRequest) => setRequest(next), []),
    cancel: useCallback(() => setRequest(null), []),
    accept,
  };
}
