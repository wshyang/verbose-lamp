import { useCallback, useState } from 'react';
import { ApiError } from '../api/client.js';
import { describeError } from './useAsyncData.js';

/**
 * Mutation primitive: one in-flight guard, one error slot, one optional success callback.
 * Keeps "submit a form / press a button" logic out of components.
 */

export interface ActionState<TInput, TOutput> {
  run: (input: TInput) => Promise<TOutput | null>;
  isPending: boolean;
  error: string | null;
  errorField: string | undefined;
  clearError: () => void;
}

type Attempt<T> = { ok: true; output: T } | { ok: false; caught: unknown };

/** Turns a rejection into a value, so the caller never needs try/catch around its state. */
async function attempt<TInput, TOutput>(
  action: (input: TInput) => Promise<TOutput>,
  input: TInput,
): Promise<Attempt<TOutput>> {
  try {
    return { ok: true, output: await action(input) };
  } catch (caught) {
    return { ok: false, caught };
  }
}

export function useAction<TInput, TOutput>(
  action: (input: TInput) => Promise<TOutput>,
  onSuccess?: (output: TOutput, input: TInput) => void,
): ActionState<TInput, TOutput> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | undefined>(undefined);

  const run = useCallback(
    async (input: TInput): Promise<TOutput | null> => {
      setIsPending(true);
      setError(null);
      setErrorField(undefined);
      const outcome = await attempt(action, input);
      setIsPending(false);
      if (!outcome.ok) {
        setError(describeError(outcome.caught));
        setErrorField(outcome.caught instanceof ApiError ? outcome.caught.field : undefined);
        return null;
      }
      onSuccess?.(outcome.output, input);
      return outcome.output;
    },
    [action, onSuccess],
  );

  return {
    run,
    isPending,
    error,
    errorField,
    clearError: () => {
      setError(null);
      setErrorField(undefined);
    },
  };
}
