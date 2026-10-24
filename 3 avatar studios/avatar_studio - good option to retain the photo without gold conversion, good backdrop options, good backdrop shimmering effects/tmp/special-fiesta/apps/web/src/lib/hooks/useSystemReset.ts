import { useCallback, useState } from 'react';
import type { SystemResetView } from '@psd/contracts';
import { requestSystemResetChallenge, resetSystem } from '../api/admin.js';
import { useAction } from './useAction.js';

/**
 * ADR-307 — the reset's state machine, kept out of the panel.
 *
 * `idle` shows only the warning and the one red button. Asking to begin fetches a
 * fresh challenge from the server — the confirmation the operator must type is the
 * server's random string, never one this page invents — and moves to `confirming`.
 * Every submission spends that challenge on the server, success or failure, so a
 * refused attempt drops back to `idle`: the operator reads the refusal, and
 * beginning again mints a visibly new code. `done` holds the server's own counts.
 */
export type SystemResetPhase = 'idle' | 'confirming' | 'done';

export function useSystemReset() {
  const [phase, setPhase] = useState<SystemResetPhase>('idle');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [result, setResult] = useState<SystemResetView | null>(null);

  const challenge = useAction(
    useCallback(() => requestSystemResetChallenge(), []),
    useCallback((issued: { confirmation: string }) => {
      setConfirmation(issued.confirmation);
      setPhase('confirming');
    }, []),
  );

  const submit = useAction(
    useCallback(
      (body: { passcode: string; confirmation: string }) => resetSystem(body),
      [],
    ),
    useCallback((output: { reset: SystemResetView }) => {
      setResult(output.reset);
      setConfirmation(null);
      setPhase('done');
    }, []),
  );

  const refuse = useCallback(() => {
    // A spent challenge cannot be retried: back to idle, where beginning again
    // is one press and mints a new code. The refusal itself stays on screen.
    setConfirmation(null);
    setPhase('idle');
  }, []);

  return {
    phase,
    confirmation,
    result,
    error: challenge.error ?? submit.error,
    isBusy: challenge.isPending || submit.isPending,
    begin: () => {
      submit.clearError();
      void challenge.run(undefined);
    },
    cancel: refuse,
    submit: async (body: { passcode: string; confirmation: string }) => {
      const output = await submit.run(body);
      if (output === null) refuse();
    },
  };
}
