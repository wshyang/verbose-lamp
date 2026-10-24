import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError, OfflineError } from '../api/client.js';
import { useAction } from './useAction.js';

describe('useAction', () => {
  it('runs the action and reports success to the caller', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAction(async (input: number) => input * 2, onSuccess));

    let output: number | null = null;
    await act(async () => {
      output = await result.current.run(21);
    });

    expect(output).toBe(42);
    expect(onSuccess).toHaveBeenCalledWith(42, 21);
    expect(result.current.error).toBeNull();
  });

  it('captures the message and field of a rejected request', async () => {
    const { result } = renderHook(() =>
      useAction(async () => {
        throw new ApiError(400, 'PIN must be exactly 4 digits.', 'pin');
      }),
    );

    await act(async () => {
      await result.current.run(undefined);
    });

    expect(result.current.error).toBe('PIN must be exactly 4 digits.');
    expect(result.current.errorField).toBe('pin');

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('reports an offline failure without blaming a field', async () => {
    const { result } = renderHook(() =>
      useAction(async () => {
        throw new OfflineError();
      }),
    );

    await act(async () => {
      await result.current.run(undefined);
    });

    expect(result.current.error).toContain("Can't reach Active Day");
    expect(result.current.errorField).toBeUndefined();
  });
});
