import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PassportView } from '@psd/contracts';
import { participantSession } from '../../test-utils/fixtures.js';
import { SessionContext, type SessionState } from '../session/context.js';
import { buildChop } from '../passport/chop.js';
import { dieForStation } from '../passport/chopAssign.js';
import { chopSeedFor } from '../passport/chopSeeds.js';

const fetchMyPassport = vi.fn();

vi.mock('../api/participants.js', () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
}));

const { usePassport } = await import('./usePassport.js');

/**
 * ADR-239 / ADR-240 — the passport tab's data.
 *
 * The API boundary is the only thing mocked. The device cache and the chop seeds are the real
 * ones, because what this hook owes a participant is that a stamp keeps its look on the device.
 */

const view: PassportView = {
  stations: [
    { activityId: 'station-dash', activityName: 'Beach Dash', isCompleted: true, completions: 1 },
    { activityId: 'station-tug', activityName: 'Tug of Rope', isCompleted: false, completions: 0 },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  fetchMyPassport.mockReset();
});

/*
 * The device cache only serves a signed-in participant (cacheStore.ts), so the warm-start cases
 * run as one. Without a session the cache is bypassed and those cases would prove nothing.
 */
function signedIn({ children }: { children: ReactNode }) {
  const state: SessionState = {
    session: participantSession,
    isLoading: false,
    refresh: () => Promise.resolve(participantSession),
    endSession: () => Promise.resolve(true),
  };
  return createElement(SessionContext.Provider, { value: state }, children);
}

async function settle<T extends { result: { current: { isLoading: boolean } } }>(
  hook: T,
): Promise<void> {
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
}

describe('ADR-239 — the passport tab data', () => {
  it('lists every station, gives a completed one its chop, and leaves the other as an open slot', async () => {
    fetchMyPassport.mockResolvedValue(view);
    const hook = renderHook(() => usePassport(), { wrapper: signedIn });
    await settle(hook);

    const [dash, tug] = hook.result.current.stations;
    expect(hook.result.current.stations.map((station) => station.activityName)).toEqual([
      'Beach Dash',
      'Tug of Rope',
    ]);
    expect(dash?.chops).toEqual([
      buildChop(chopSeedFor('station-dash'), dieForStation('station-dash'), 'Beach Dash'),
    ]);
    expect(tug?.chops).toEqual([]);
    expect(hook.result.current.progress).toBe('1 of 2 stations completed');
  });

  /*
   * ADR-242 — the die belongs to the station, so it is asked for from the id and not from the
   * seed. A device that has never seen this station still draws the same shape there as any other.
   */
  it('strikes each station with the die that station always gets', async () => {
    fetchMyPassport.mockResolvedValue(view);
    const hook = renderHook(() => usePassport(), { wrapper: signedIn });
    await settle(hook);
    expect(hook.result.current.stations[0]?.chops[0]?.die).toBe(dieForStation('station-dash'));
  });

  it('shows the same chop on every visit from the same device', async () => {
    fetchMyPassport.mockResolvedValue(view);
    const first = renderHook(() => usePassport(), { wrapper: signedIn });
    await settle(first);
    const firstChop = first.result.current.stations[0]?.chops;
    first.unmount();

    const second = renderHook(() => usePassport(), { wrapper: signedIn });
    await settle(second);
    expect(second.result.current.stations[0]?.chops).toEqual(firstChop);
  });

  /*
   * ADR-261 — a station scored at in three rounds carries three impressions of its die, and
   * "the same die three times" must not mean "the same picture three times": every strike is
   * its own seed's work, while the FIRST strike stays the one the device has always shown.
   */
  it('strikes once per completion, same die and a different impression each time', async () => {
    fetchMyPassport.mockResolvedValue({
      stations: [
        { activityId: 'station-again', activityName: 'Beach Dash', isCompleted: true, completions: 3 },
        { activityId: 'station-tug', activityName: 'Tug of Rope', isCompleted: false, completions: 0 },
      ],
    } satisfies PassportView);
    const hook = renderHook(() => usePassport(), { wrapper: signedIn });
    await settle(hook);

    const chops = hook.result.current.stations[0]?.chops ?? [];
    expect(chops).toHaveLength(3);
    expect(new Set(chops.map((chop) => chop.die))).toEqual(new Set([dieForStation('station-again')]));
    expect(new Set(chops.map((chop) => chop.seed)).size).toBe(3);
    expect(new Set(chops.map((chop) => JSON.stringify(chop.placement))).size).toBe(3);
    expect(chops[0]).toEqual(
      buildChop(chopSeedFor('station-again'), dieForStation('station-again'), 'Beach Dash'),
    );
    // A station's completion still counts once toward the day's progress.
    expect(hook.result.current.progress).toBe('1 of 2 stations completed');
    expect(hook.result.current.stations[0]?.completions).toBe(3);
  });

  /*
   * ADR-262 — the drawn stack is capped, the count is not: five completions hand the
   * page three impressions and the number five, so it can fold two into "+2 more".
   */
  it('caps the drawn stack and keeps the true count beside it', async () => {
    fetchMyPassport.mockResolvedValue({
      stations: [
        { activityId: 'station-habitual', activityName: 'Beach Dash', isCompleted: true, completions: 5 },
      ],
    } satisfies PassportView);
    const hook = renderHook(() => usePassport(), { wrapper: signedIn });
    await settle(hook);

    expect(hook.result.current.stations[0]?.completions).toBe(5);
    expect(hook.result.current.stations[0]?.chops).toHaveLength(3);
  });

  it('paints the device copy at once, then asks the server again on every visit', async () => {
    // The second visit's answer never arrives: what the participant sees must not wait for it.
    fetchMyPassport
      .mockResolvedValueOnce(view)
      .mockReturnValueOnce(new Promise<PassportView>(() => undefined));
    const first = renderHook(() => usePassport(), { wrapper: signedIn });
    await settle(first);
    first.unmount();

    const second = renderHook(() => usePassport(), { wrapper: signedIn });
    expect(second.result.current.stations).toHaveLength(2);
    await waitFor(() => expect(fetchMyPassport).toHaveBeenCalledTimes(2));
  });

  it('says station, not stations, when the day has exactly one', async () => {
    fetchMyPassport.mockResolvedValue({ stations: [view.stations[0]!] });
    const hook = renderHook(() => usePassport(), { wrapper: signedIn });
    await settle(hook);
    expect(hook.result.current.progress).toBe('1 of 1 station completed');
  });

  it('shows no progress line for a day that has no stations yet', async () => {
    fetchMyPassport.mockResolvedValue({ stations: [] });
    const hook = renderHook(() => usePassport(), { wrapper: signedIn });
    await settle(hook);
    expect(hook.result.current.stations).toEqual([]);
    expect(hook.result.current.progress).toBeUndefined();
  });
});
