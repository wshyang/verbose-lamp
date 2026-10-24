import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { SessionContext, useSession, useSessionOrNull } from './context.js';
import type { SessionState } from './context.js';
import { participantSession } from '../../test-utils/fixtures.js';
import { useSync } from './syncContext.js';

/**
 * Both contexts fail loudly rather than silently returning an empty session, so a surface
 * mounted outside its provider is caught the first time it is rendered.
 */

describe('context guards', () => {
  it('refuses to hand out a session outside <SessionProvider>', () => {
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
  });

  it('refuses to hand out the sync queue outside <SyncProvider>', () => {
    expect(() => renderHook(() => useSync())).toThrow(/SyncProvider/);
  });

  /** ADR-103 — the null-safe twin: "nobody" outside the provider, the session inside it. */
  it('reads nobody outside the provider, and the viewer inside it', () => {
    const outside = renderHook(() => useSessionOrNull());
    expect(outside.result.current).toBeNull();

    const state: SessionState = {
      session: participantSession,
      isLoading: false,
      refresh: () => Promise.resolve(participantSession),
      endSession: () => Promise.resolve(true),
    };
    const inside = renderHook(() => useSessionOrNull(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(SessionContext.Provider, { value: state }, children),
    });
    expect(inside.result.current).toBe(participantSession);
  });
});
