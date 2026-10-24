import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEAM_CHAT_TYPING_TTL_MS } from '@psd/contracts';
import type { TeamChatTypingView } from '@psd/contracts';
import { useTypingWatchers } from './useTeamChatTyping.js';

/**
 * ADR-146 — the receiving half of the typing indicator, on its own.
 *
 * `TeamChatPanel.test.tsx` already covers what the room shows. What it cannot see is the
 * sweep's cost: the hook prunes expired typists on a one-second timer, and that timer runs for
 * as long as anybody is typing. Whether it re-renders the room each time it ticks is invisible
 * through a rendered panel and is the whole reason the sweep returns the same object when
 * nothing has expired — a busy room would otherwise re-render every message, avatar and
 * timestamp once a second for as long as one person holds a key down.
 */

function typing(participantId: string, label: string): TeamChatTypingView {
  return { participantId, label } as TeamChatTypingView;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the typing sweep', () => {
  it('does not re-render the room on a tick where nothing expired', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useTypingWatchers({ myParticipantId: 'me' });
    });

    act(() => {
      result.current.sink.absorb(typing('p1', 'Wei_Ling'));
    });
    expect(result.current.labels).toEqual(['Wei_Ling']);
    const settled = renders;

    /*
     * Five sweeps, all inside the 6-second TTL, every one of them finding the same single
     * typist. A sweep that rebuilt the map — `Object.fromEntries` over an unchanged list is a
     * NEW object — would set state five times and re-render the room five times.
     *
     * The budget is one, not zero: React re-renders a component once more before it bails out
     * on a reducer that returned the state it was given. That first extra render is the price
     * of the shortcut; the other four are what the shortcut buys.
     */
    /*
     * One tick per `act`, deliberately. Advancing five seconds inside a single `act` lets
     * React batch every resulting update into one render, which makes a hook that re-renders
     * per tick indistinguishable from one that does not — the first version of this test
     * passed with the shortcut deleted for exactly that reason.
     */
    for (let tick = 0; tick < 5; tick += 1) {
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
    }

    expect(renders - settled).toBeLessThanOrEqual(1);
    expect(result.current.labels).toEqual(['Wei_Ling']);
  });

  /* And the sweep must still do its job, or the cheapest way to pass the test above is to
     delete the timer. */
  it('still forgets a typist once the TTL runs out', () => {
    const { result } = renderHook(() => useTypingWatchers({ myParticipantId: 'me' }));
    act(() => {
      result.current.sink.absorb(typing('p1', 'Wei_Ling'));
    });

    act(() => {
      vi.advanceTimersByTime(TEAM_CHAT_TYPING_TTL_MS + 1_500);
    });

    expect(result.current.labels).toEqual([]);
  });

  /*
   * Two typists, one of whom goes quiet. This is the case the identity shortcut could break if
   * it were written as "same count, same map": the count changes here, so the sweep must
   * rebuild — and the survivor must survive.
   */
  it('drops only the typist who went quiet', () => {
    const { result } = renderHook(() => useTypingWatchers({ myParticipantId: 'me' }));
    act(() => {
      result.current.sink.absorb(typing('p1', 'Wei_Ling'));
    });
    act(() => {
      vi.advanceTimersByTime(TEAM_CHAT_TYPING_TTL_MS - 1_000);
      result.current.sink.absorb(typing('p2', 'Marcus_Lim'));
    });

    // Past the first typist's expiry, still inside the second's.
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(result.current.labels).toEqual(['Marcus_Lim']);
  });

  it('stops sweeping altogether once the room is quiet', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useTypingWatchers({ myParticipantId: 'me' });
    });
    act(() => {
      result.current.sink.absorb(typing('p1', 'Wei_Ling'));
    });
    act(() => {
      vi.advanceTimersByTime(TEAM_CHAT_TYPING_TTL_MS + 1_500);
    });
    const afterExpiry = renders;

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // No watchers, no timer, no work — for most of the afternoon this is the state the room
    // is in.
    expect(renders).toBe(afterExpiry);
  });
});
